"""Seed the events table with synthetic rows, in bulk, with COPY.

Why: the event list has acceptance criteria measured on 1M rows (first page p95, a page 500k
deep, filters). The numbers must be reproducible, so the data comes from one command.

Requirements the data must meet, because each one changed a query plan or a test:
    - Type mix close to production: ~90% page_view, ~8% purchase, ~2% error. The share of
      `error` decided the cost of the type filter.
    - occurred_at spread over a few weeks with millisecond precision, including many equal
      values, so the (occurred_at, id) cursor and its tie-breaker are exercised. Rows are
      inserted oldest first, so id grows with occurred_at, as it does with live ingestion.
    - Payloads valid for their type (server/src/events/dto/event-payloads.ts).
    - Deterministic: the same --seed gives the same rows, so two runs can be compared.
    - ANALYZE after the load, otherwise the planner works with stale statistics.
    - Never truncates or overwrites a table silently: a non-empty table is refused unless
      --truncate is passed. The load is one transaction, so a failure leaves the table as it was.

Usage:
    uv run --env-file .env seed_events.py --rows 1000000
    uv run --env-file .env seed_events.py --rows 1000000 --truncate
"""

import json
import logging
import random
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

import psycopg
import typer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("seed_events")

EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
# Fixed instead of now(): the same --seed must give the same rows on any day.
DEFAULT_END = datetime(2026, 11, 2)
# Share of events that repeat the previous event's occurred_at to the millisecond.
TIE_PROBABILITY = 0.05
LOG_EVERY = 100_000

TYPES = ["page_view", "purchase", "error"]
TYPE_WEIGHTS = [90, 8, 2]
PAGES = ["home", "catalog", "category", "item", "cart", "checkout", "my-orders"]
PAGES_NEED_ENTITY_ID = {"category", "item"}
OPERATIONS = [
    "add_to_cart",
    "remove_from_cart",
    "apply_promo",
    "create_order",
    "process_payment",
    "send_order_confirmation",
]
ERROR_CODES = [
    "validation",
    "unauthorized",
    "not_found",
    "conflict",
    "payment_declined",
    "network",
    "timeout",
    "internal",
    "unknown",
]


def page_view_payload(rng: random.Random) -> dict[str, Any]:
    page_id = rng.choice(PAGES)
    payload: dict[str, Any] = {"page_id": page_id}
    if page_id in PAGES_NEED_ENTITY_ID:
        payload["entity_id"] = str(rng.randrange(1, 5000))
    if rng.random() < 0.4:
        payload["referrer"] = f"https://example.com/r/{rng.randrange(1, 1000)}"
    if rng.random() < 0.15:
        payload["utm_source"] = rng.choice(["google", "facebook", "newsletter"])
        payload["utm_medium"] = rng.choice(["cpc", "email", "social"])
    return payload


def purchase_payload(rng: random.Random) -> dict[str, Any]:
    items = [
        {
            "id": f"item_{rng.randrange(1, 5000)}",
            "unit_price": rng.randrange(100, 50_000),
            "quantity": rng.randrange(1, 4),
        }
        for _ in range(rng.randrange(1, 6))
    ]
    return {
        "order_id": f"order_{rng.getrandbits(40)}",
        "channel": rng.choice(["app", "phone", "admin"]),
        "sum": sum(item["unit_price"] * item["quantity"] for item in items),
        "items": items,
    }


def error_payload(rng: random.Random) -> dict[str, Any]:
    return {"operation": rng.choice(OPERATIONS), "code": rng.choice(ERROR_CODES)}


PAYLOADS = {
    "page_view": page_view_payload,
    "purchase": purchase_payload,
    "error": error_payload,
}


def make_row(rng: random.Random, event_type: str, occurred_at: datetime) -> tuple[Any, ...]:
    # uuid4() reads the OS entropy pool; building the UUID from rng keeps it reproducible.
    event_id = uuid.UUID(int=rng.getrandbits(128), version=4)
    # Purchases come from the backend, the other events from clients (EVENT_CONTRACT.md).
    if event_type == "purchase":
        source = "server"
    else:
        source = "web" if rng.random() < 0.6 else "mobile"
    user_id = f"user_{rng.randrange(1, 100_001)}" if rng.random() < 0.7 else None
    device_id = None if source == "server" else f"dev_{rng.randrange(1, 300_001)}"
    payload = json.dumps(PAYLOADS[event_type](rng))
    return (event_id, event_type, source, user_id, device_id, payload, occurred_at)


def occurred_at_values(
    rng: random.Random, rows: int, start: datetime, end: datetime
) -> list[datetime]:
    one_ms = timedelta(milliseconds=1)
    start_ms, end_ms = (start - EPOCH) // one_ms, (end - EPOCH) // one_ms
    # Sorted, so inserting in this order makes id grow with occurred_at.
    stamps = sorted(rng.randrange(start_ms, end_ms) for _ in range(rows))
    for i in range(1, rows):
        if rng.random() < TIE_PROBABILITY:
            stamps[i] = stamps[i - 1]
    return [EPOCH + ms * one_ms for ms in stamps]


def main(
    database_url: Annotated[
        str, typer.Option(envvar="DATABASE_URL", help="Postgres connection string")
    ],
    rows: Annotated[int, typer.Option(min=1, help="How many events to insert")] = 10,
    seed: Annotated[
        int,
        typer.Option(min=0, help="Seed of the random generator; the same seed gives the same rows"),
    ] = 42,
    days: Annotated[
        int, typer.Option(min=1, help="Length of the time window to spread events over")
    ] = 30,
    end: Annotated[
        datetime, typer.Option(help="End of the window (UTC). Fixed by default, see DEFAULT_END")
    ] = DEFAULT_END,
    truncate: Annotated[
        bool, typer.Option(help="Empty the events table first and restart its ids")
    ] = False,
) -> None:
    started = time.monotonic()
    end = end.replace(tzinfo=UTC) if end.tzinfo is None else end
    start = end - timedelta(days=days)
    rng = random.Random(seed)

    # Order matters: every rng call below is part of what a seed reproduces.
    occurred = occurred_at_values(rng, rows, start, end)
    types = rng.choices(TYPES, weights=TYPE_WEIGHTS, k=rows)

    # Not autocommit: the check, the truncate and the load are one transaction.
    with psycopg.connect(database_url) as connection:
        log.info(
            "target: db=%s user=%s host=%s rows=%d seed=%d window=%s..%s",
            connection.info.dbname,
            connection.info.user,
            connection.info.host,
            rows,
            seed,
            start.isoformat(),
            end.isoformat(),
        )

        row = connection.execute("SELECT EXISTS (SELECT 1 FROM events)").fetchone()
        assert row is not None  # EXISTS always returns one row
        if row[0] and not truncate:
            log.error("events is not empty; pass --truncate to empty it first")
            raise typer.Exit(code=1)
        if truncate:
            log.warning("truncating events (--truncate)")
            connection.execute("TRUNCATE events RESTART IDENTITY")

        with (
            connection.cursor() as cursor,
            cursor.copy(
                "COPY events (event_id, type, source, user_id, device_id, payload, occurred_at) "
                "FROM STDIN"
            ) as copy,
        ):
            for number, (event_type, occurred_at) in enumerate(zip(types, occurred), start=1):
                copy.write_row(make_row(rng, event_type, occurred_at))
                if number % LOG_EVERY == 0:
                    log.info("copied %d / %d rows", number, rows)

        # Without fresh statistics the planner picks plans that production would not.
        connection.execute("ANALYZE events")

        for event_type, count in connection.execute(
            "SELECT type, count(*) FROM events GROUP BY type ORDER BY count(*) DESC"
        ):
            log.info("%-10s %9d (%.2f%%)", event_type, count, 100 * count / rows)

    log.info("done in %.1fs", time.monotonic() - started)


if __name__ == "__main__":
    typer.run(main)
