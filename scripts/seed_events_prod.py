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
    - Type mix close to production: ~90% page_view, ~8% purchase, ~2% error.
    - Payloads valid for their type (server/src/events/dto/event-payloads.ts).
    - Deterministic: the same --seed gives the same rows, so two runs can be compared.
    - ANALYZE after the load, otherwise the planner works with stale statistics.
    - Always empties the events table first (local use only, no flag, no prompt). Truncate and load
      are one transaction, so a failure leaves the table as it was.
"""

import random
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from statistics import NormalDist
from typing import Annotated, Literal, get_args

import typer

Bucket = Literal["fast", "slow", "offline"]
BUCKETS = list(get_args(Bucket))

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
) -> list[datetime]:
    """Return `rows` occurred_at values in the window ending at `end`, in random order.

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
    offsets = baseline_offsets + spike_offsets + ramp_offsets
    rng.shuffle(offsets)
    return [start + timedelta(seconds=offset) for offset in offsets]


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
    rng = random.Random(seed)
    end = end.replace(tzinfo=UTC) if end.tzinfo is None else end
    occurred_at = generate_distributed_occurred_at(end, rows, rng)
    created_at = generate_created_at(occurred_at, end, rng)
    events = sorted(zip(created_at, occurred_at, strict=True))
    print(events[:3])


if __name__ == "__main__":
    typer.run(main)
