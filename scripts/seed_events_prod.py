"""Seed the events table with rows that look like live ingestion, in bulk, with COPY.

Why: seed_events.py gives every row a created_at of "now" and sorts by occurred_at, so the data is
too tidy. Query plans, the (occurred_at, id) cursor and BRIN indexes behave differently on data
shaped like production, so the benchmarks need this one.

Requirements the data must meet, because each one changes a query plan or a test:
    - created_at is when the server received the event, occurred_at when it happened:
      created_at = occurred_at + lag, so lag is never negative. Lag comes in three buckets:
      ~85% fast (up to 200 ms), ~12% slow (200 ms..30 s), ~3% offline clients (30 s..1 h).
      Inside fast and slow the value is uniform (a simplification); inside offline, the longer
      the lag, the fewer events.
    - Rows are inserted in created_at order, so id grows with created_at. occurred_at is then only
      roughly sorted along id, as in production; a strict order would flatter the cursor and BRIN.
    - created_at never lands after the end of the window: no events from the future. A lag that
      would overshoot is redrawn, so events right before the end get shorter lags than real ones.
    - occurred_at over a 5-day window ending at `end`: an even baseline, a spike a few hours before
      the end and a ramp in the last hour. The shares are derived from the client's numbers
      (35% of events in the last day, 4.5% in the last hour), see derive_shares.
    - occurred_at keeps millisecond precision with some equal values, so the tie-breaker of the
      (occurred_at, id) cursor is still exercised.
    - Type mix per group, from the client: a normal day is ~94% page_view, ~5.5% purchase, ~0.5%
      error; the spike is a sale under load, ~78.5% / 20% / 1.5%. The ramp uses the normal mix.
      The overall mix is a result, not an input: ~91.6% / 7.8% / 0.66%.
    - Payloads valid for their type (server/src/events/dto/event-payloads.ts) and shaped by the
      group: the sale spike carries the utm campaign and goes through the app channel.
    - Envelope fields follow EVENT_CONTRACT.md: purchases come from the server, clients always
      have a device_id, a purchase always has a user_id. event_id is built from the seed.
    - Deterministic: the same --seed gives the same rows, so two runs can be compared.
    - ANALYZE after the load, otherwise the planner works with stale statistics.
    - Always empties the events table first (local use only, no flag, no prompt). Truncate and load
      are one transaction, so a failure leaves the table as it was.
"""

import json
import logging
import math
import os
import random
import time
import uuid
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import NormalDist
from typing import Annotated, Any, Literal, get_args

import psycopg
import typer

logger = logging.getLogger(__name__)

Bucket = Literal["fast", "slow", "offline"]
Group = Literal["baseline", "spike", "ramp"]
BUCKETS = list(get_args(Bucket))

EventType = Literal["page_view", "purchase", "error"]
EVENT_TYPES = list(get_args(EventType))
# Weights in percent, in the order of EVENT_TYPES.
NORMAL_TYPE_WEIGHTS = [94, 5.5, 0.5]
SPIKE_TYPE_WEIGHTS = [78.5, 20, 1.5]
TYPE_WEIGHTS: dict[Group, list[float]] = {
    "baseline": NORMAL_TYPE_WEIGHTS,
    "spike": SPIKE_TYPE_WEIGHTS,
    "ramp": NORMAL_TYPE_WEIGHTS,
}

# Page vocabulary of EVENT_CONTRACT.md; category and item pages always carry an entity_id.
PAGES = ["home", "catalog", "category", "item", "cart", "checkout", "my-orders"]
PAGE_WEIGHTS = [30, 20, 15, 20, 6, 4, 5]
PAGES_NEED_ENTITY_ID = {"category", "item"}
CATEGORY_COUNT = 200
ITEM_COUNT = 5000
# Share of page views that arrive with utm tags; the sale spike is mostly campaign traffic.
UTM_SHARE: dict[Group, float] = {"baseline": 0.10, "spike": 0.45, "ramp": 0.10}
SALE_CAMPAIGN = "autumn_sale"
SALE_SHARE_OF_UTM_IN_SPIKE = 0.7
UTM_SOURCES = [("google", "cpc"), ("facebook", "social"), ("newsletter", "email")]
REFERRER_SHARE = 0.4

CHANNELS = ["app", "phone", "admin"]
# Weights in percent, in the order of CHANNELS. Outside the apps ~10-15% of orders; the sale goes
# through the app.
CHANNEL_WEIGHTS: dict[Group, list[float]] = {
    "baseline": [87, 8, 5],
    "spike": [95, 3, 2],
    "ramp": [87, 8, 5],
}
ITEMS_PER_ORDER = [1, 2, 3, 4, 5]
ITEMS_PER_ORDER_WEIGHTS = [55, 25, 10, 6, 4]
QUANTITIES = [1, 2, 3]
QUANTITY_WEIGHTS = [80, 15, 5]
# Kopiyky; a log-normal with the median around 500 UAH and a floor of 1 UAH.
PRICE_MEDIAN = 50_000
PRICE_SIGMA = 0.8
PRICE_MEDIAN_LOG = math.log(PRICE_MEDIAN)
MIN_PRICE = 100
DELIVERY_FEE = 8_000
PROMO_DISCOUNT = 0.9
# sum is what the customer paid: the items, plus delivery, or minus a promo (EVENT_CONTRACT.md).
SUM_DELIVERY_SHARE = 0.2
SUM_PROMO_SHARE = 0.1

# (operation, code, weight)
ERRORS = [
    ("process_payment", "payment_declined", 25),
    ("process_payment", "timeout", 10),
    ("add_to_cart", "network", 15),
    ("add_to_cart", "validation", 8),
    ("apply_promo", "not_found", 8),
    ("create_order", "conflict", 6),
    ("create_order", "internal", 6),
    ("send_order_confirmation", "timeout", 8),
    ("remove_from_cart", "unknown", 4),
]
ERROR_PAGE_SHARE = 0.8

CLIENT_SOURCES = ["web", "mobile"]
CLIENT_SOURCE_WEIGHTS = [60, 40]
# Errors also come from background work on the server.
ERROR_SOURCES = ["web", "mobile", "server"]
ERROR_SOURCE_WEIGHTS = [55, 35, 10]
USER_COUNT = 100_000
DEVICE_COUNT = 300_000
LOGGED_IN_SHARE = 0.5
# A purchase always has a buyer (a guest gets a record), but not always a device id.
PURCHASE_DEVICE_SHARE = 0.75

# Client's requirements for occurred_at; the shares and the spike geometry are derived from them.
WINDOW_DAYS = 5
LAST_DAY_SHARE = 0.35
LAST_HOUR_SHARE = 0.045
LAST_HOUR = timedelta(hours=1)
SPIKE_DURATION = timedelta(hours=3.5)
SPIKE_ENDS_BEFORE_END = timedelta(minutes=45)

# Lag of created_at. MIN_LAG is the smallest lag generate_lags can return.
MIN_LAG = timedelta(milliseconds=1)
# Buckets, in the order of BUCKETS: weights in percent and (low, high, mode) in seconds.
# The low of slow/offline is shifted by 1 ms because the bound is exclusive.
LAG_WEIGHTS = [85, 12, 3]
LAG_LIMITS: dict[Bucket, tuple[float, float, float]] = {
    "fast": (MIN_LAG.total_seconds(), 0.2, 0.05),
    "slow": (0.201, 30, 1),
    "offline": (30.001, 3600, 30.001),
}

SPIKE_CENTER_BEFORE_END = SPIKE_ENDS_BEFORE_END + SPIKE_DURATION / 2
# +-2 sigma holds ~95% of the values, so 4 sigma is the spike duration.
SPIKE_SIGMA = SPIKE_DURATION / 4


@dataclass(frozen=True)
class Shares:
    # Fractions of all events; they sum to 1.
    spike: float  # a few hours of high traffic shortly before the end (an incident or a campaign)
    ramp: float  # growing activity in the last hour, so the live screen is not quiet
    baseline: float  # steady traffic spread evenly over the whole window


def derive_shares() -> Shares:
    """Split the events into spike, ramp and baseline so the client's numbers come out.

    Two equations, two unknowns: the last-day share gives spike + ramp together, the last-hour
    share then separates them.
    """
    # The last day holds the spike, the ramp and 1/WINDOW_DAYS of the uniform baseline.
    spike_and_ramp = (LAST_DAY_SHARE - 1 / WINDOW_DAYS) / (1 - 1 / WINDOW_DAYS)
    baseline = 1 - spike_and_ramp
    # The last hour holds its part of the baseline, the tail of the spike and the whole ramp.
    baseline_in_last_hour = baseline * LAST_HOUR / timedelta(days=WINDOW_DAYS)
    spike_in_last_hour = NormalDist().cdf(-(SPIKE_CENTER_BEFORE_END - LAST_HOUR) / SPIKE_SIGMA)
    spike = (spike_and_ramp + baseline_in_last_hour - LAST_HOUR_SHARE) / (1 - spike_in_last_hour)
    shares = Shares(spike=spike, ramp=spike_and_ramp - spike, baseline=baseline)
    if min(shares.spike, shares.ramp, shares.baseline) < 0:
        # A negative count would silently hand its rows to the other groups.
        raise ValueError(f"The requirements cannot be met together, got {shares}")
    return shares


def generate_lags(rng: random.Random, rows: int) -> list[timedelta]:
    distribution: list[Bucket] = rng.choices(BUCKETS, LAG_WEIGHTS, k=rows)
    return [timedelta(seconds=round(rng.triangular(*LAG_LIMITS[x]), 3)) for x in distribution]


def format_lag(lag: timedelta) -> str:
    seconds = lag.total_seconds()
    if seconds >= 3600:
        return f"{seconds / 3600:.2f} h"
    if seconds >= 60:
        return f"{seconds / 60:.2f} min"
    if seconds >= 1:
        return f"{seconds:.2f} s"
    return f"{seconds * 1000:.0f} ms"


def draw_within_window(draw: Callable[[], float], count: int, latest: float) -> list[float]:
    """Return `count` offsets in seconds from the window start, drawn with `draw`, in 0..`latest`."""
    # Redraw instead of clamping: clamping would pile up equal values on the window edge.
    offsets: list[float] = []
    while len(offsets) < count:
        offset = round(draw(), 3)
        if 0 <= offset <= latest:
            offsets.append(offset)
    return offsets


def generate_distributed_occurred_at(
    end: datetime, rows: int, rng: random.Random
) -> tuple[list[datetime], list[Group]]:
    """Return `rows` occurred_at values in the window ending at `end`, in random order, and the
    group each of them was drawn from (same index).

    Three groups: even baseline, a spike a few hours before the end, a ramp in the last hour.
    """
    start = end - timedelta(days=WINDOW_DAYS)
    window_seconds = (end - start).total_seconds()
    last_hour_seconds = LAST_HOUR.total_seconds()
    # Leave room for the smallest lag, so created_at never has to exceed `end`.
    latest = window_seconds - MIN_LAG.total_seconds()
    spike_center_seconds = window_seconds - SPIKE_CENTER_BEFORE_END.total_seconds()
    shares = derive_shares()
    n_events_in_spike = round(rows * shares.spike)
    n_events_in_ramp = round(rows * shares.ramp)
    n_events_in_baseline = rows - n_events_in_spike - n_events_in_ramp
    baseline_offsets = draw_within_window(
        lambda: rng.uniform(0, window_seconds), n_events_in_baseline, latest
    )
    spike_offsets = draw_within_window(
        lambda: rng.gauss(spike_center_seconds, SPIKE_SIGMA.total_seconds()),
        n_events_in_spike,
        latest,
    )
    # The density grows towards the end of the window.
    ramp_offsets = draw_within_window(
        lambda: rng.triangular(window_seconds - last_hour_seconds, window_seconds, window_seconds),
        n_events_in_ramp,
        latest,
    )
    # Built piece by piece: `+` between list literals loses the declared Group type.
    labelled: list[tuple[float, Group]] = [(offset, "baseline") for offset in baseline_offsets]
    labelled.extend((offset, "spike") for offset in spike_offsets)
    labelled.extend((offset, "ramp") for offset in ramp_offsets)
    rng.shuffle(labelled)
    occurred_at = [start + timedelta(seconds=offset) for offset, _ in labelled]
    return occurred_at, [group for _, group in labelled]


def generate_created_at(
    occurred_at: list[datetime], end: datetime, rng: random.Random
) -> list[datetime]:
    """Return created_at = occurred_at + lag for every occurred_at, never later than `end`.

    A lag that would push created_at past `end` is redrawn, same as in draw_within_window.
    """
    lags = generate_lags(rng, len(occurred_at))
    created_at: list[datetime] = []
    for happened, lag in zip(occurred_at, lags, strict=True):
        room = end - happened
        while lag > room:
            lag = generate_lags(rng, 1)[0]
        created_at.append(happened + lag)
    return created_at


def generate_event_types(rng: random.Random, groups: list[Group]) -> list[EventType]:
    """Return one type per event; the mix depends on the group the event's occurred_at came from."""
    return [rng.choices(EVENT_TYPES, TYPE_WEIGHTS[group])[0] for group in groups]


def skewed_id(rng: random.Random, count: int) -> int:
    """An id in 1..count with low ids more popular, like items in a shop."""
    return int(count * rng.random() ** 3) + 1


def page_view_payload(rng: random.Random, group: Group) -> dict[str, Any]:
    page_id = rng.choices(PAGES, PAGE_WEIGHTS)[0]
    payload: dict[str, Any] = {"page_id": page_id}
    if page_id in PAGES_NEED_ENTITY_ID:
        count = CATEGORY_COUNT if page_id == "category" else ITEM_COUNT
        payload["entity_id"] = f"{page_id}_{skewed_id(rng, count)}"
    if rng.random() < REFERRER_SHARE:
        payload["referrer"] = f"https://example.com/r/{rng.randrange(1, 1000)}"
    if rng.random() < UTM_SHARE[group]:
        if group == "spike" and rng.random() < SALE_SHARE_OF_UTM_IN_SPIKE:
            payload["utm_source"] = "newsletter"
            payload["utm_medium"] = "email"
            payload["utm_campaign"] = SALE_CAMPAIGN
        else:
            payload["utm_source"], payload["utm_medium"] = rng.choice(UTM_SOURCES)
    return payload


def purchase_payload(rng: random.Random, group: Group) -> dict[str, Any]:
    count = rng.choices(ITEMS_PER_ORDER, ITEMS_PER_ORDER_WEIGHTS)[0]
    items = [
        {
            "id": f"item_{skewed_id(rng, ITEM_COUNT)}",
            "unit_price": max(MIN_PRICE, round(rng.lognormvariate(PRICE_MEDIAN_LOG, PRICE_SIGMA))),
            "quantity": rng.choices(QUANTITIES, QUANTITY_WEIGHTS)[0],
        }
        for _ in range(count)
    ]
    total = sum(item["unit_price"] * item["quantity"] for item in items)
    roll = rng.random()
    if roll < SUM_DELIVERY_SHARE:
        total += DELIVERY_FEE
    elif roll < SUM_DELIVERY_SHARE + SUM_PROMO_SHARE:
        total = max(1, round(total * PROMO_DISCOUNT))
    return {
        "order_id": f"ord_{rng.getrandbits(40)}",
        "channel": rng.choices(CHANNELS, CHANNEL_WEIGHTS[group])[0],
        "sum": total,
        "items": items,
    }


def error_payload(rng: random.Random, has_page: bool) -> dict[str, Any]:
    operation, code, _ = rng.choices(ERRORS, [weight for *_, weight in ERRORS])[0]
    payload: dict[str, Any] = {"operation": operation, "code": code}
    if has_page and rng.random() < ERROR_PAGE_SHARE:
        payload["page_id"] = rng.choices(PAGES, PAGE_WEIGHTS)[0]
    return payload


def make_row(
    rng: random.Random,
    event_type: EventType,
    group: Group,
    occurred_at: datetime,
    created_at: datetime,
) -> tuple[Any, ...]:
    """Build one row in COPY column order: everything the table needs except id."""
    # uuid4() reads the OS entropy pool; building the UUID from rng keeps it reproducible.
    event_id = uuid.UUID(int=rng.getrandbits(128), version=4)
    # Only the backend sends purchases (EVENT_CONTRACT.md).
    if event_type == "purchase":
        source = "server"
    elif event_type == "error":
        source = rng.choices(ERROR_SOURCES, ERROR_SOURCE_WEIGHTS)[0]
    else:
        source = rng.choices(CLIENT_SOURCES, CLIENT_SOURCE_WEIGHTS)[0]

    if event_type == "page_view":
        payload = page_view_payload(rng, group)
    elif event_type == "purchase":
        payload = purchase_payload(rng, group)
    else:
        payload = error_payload(rng, has_page=source != "server")

    user_id = None
    if event_type == "purchase" or rng.random() < LOGGED_IN_SHARE:
        user_id = f"user_{rng.randrange(1, USER_COUNT + 1)}"
    has_device = source != "server" or (
        event_type == "purchase" and rng.random() < PURCHASE_DEVICE_SHARE
    )
    device_id = f"dev_{rng.randrange(1, DEVICE_COUNT + 1)}" if has_device else None
    return (
        event_id,
        event_type,
        source,
        user_id,
        device_id,
        json.dumps(payload),
        occurred_at,
        created_at,
    )


def database_url() -> str:
    # Read on use, not on import, so the tests can import this module without a database.
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set")
    return url


def replace_events(table_rows: list[tuple[Any, ...]]) -> None:
    # TRUNCATE and COPY share one transaction: if COPY fails, the old rows stay.
    with psycopg.connect(database_url()) as connection:
        connection.execute("TRUNCATE events RESTART IDENTITY")
        with (
            connection.cursor() as cursor,
            cursor.copy(
                "COPY events (event_id, type, source, user_id, device_id, payload, "
                "occurred_at, created_at) FROM STDIN"
            ) as copy,
        ):
            for row in table_rows:
                copy.write_row(row)


def format_counts(counts: Counter[str], total: int) -> str:
    return ", ".join(f"{name} {count / total:.1%}" for name, count in counts.most_common())


def update_stats() -> None:
    with psycopg.connect(database_url()) as connection:
        connection.execute("ANALYZE events;")


def main(
    rows: Annotated[int, typer.Option(min=1, help="How many events to insert")] = 10,
    seed: Annotated[
        int,
        typer.Option(min=0, help="Seed of the random generator; the same seed gives the same rows"),
    ] = 42,
    end: Annotated[
        datetime,
        typer.Option(
            help="End of the window (UTC, no timezone suffix). "
            "Formats: YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS, YYYY-MM-DD HH:MM:SS"
        ),
        # The default is evaluated on every run of the script, so --help shows the real end.
    ] = datetime.now(UTC).replace(minute=0, second=0, microsecond=0),  # noqa: B008
) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    started = time.perf_counter()
    rng = random.Random(seed)
    end = end.replace(tzinfo=UTC) if end.tzinfo is None else end
    logger.info("Seeding %d events, seed=%d, window ends %s", rows, seed, end.isoformat())
    occurred_at, groups = generate_distributed_occurred_at(end, rows, rng)
    created_at = generate_created_at(occurred_at, end, rng)
    event_types = generate_event_types(rng, groups)
    logger.info("Generated timestamps and types in %.1f s", time.perf_counter() - started)
    # Sorted by created_at, so id grows with it; the group travels along to shape the payload.
    events = sorted(zip(created_at, occurred_at, event_types, groups, strict=True))
    # Rows are built after sorting: every rng call below is part of what a seed reproduces.
    table_rows = [
        make_row(rng, event_type, group, happened, received)
        for received, happened, event_type, group in events
    ]
    logger.info("Built %d rows in %.1f s", len(table_rows), time.perf_counter() - started)
    logger.info("Groups: %s", format_counts(Counter(groups), rows))
    logger.info("Types: %s", format_counts(Counter(event_types), rows))
    loading = time.perf_counter()
    replace_events(table_rows)
    logger.info("Truncated and copied into events in %.1f s", time.perf_counter() - loading)
    update_stats()
    logger.info("Analyzed events, done in %.1f s", time.perf_counter() - started)


if __name__ == "__main__":
    typer.run(main)
