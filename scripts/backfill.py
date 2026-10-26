"""Backfill events.occurred_at_ms from events.occurred_at in small, throttled batches.

Step 3 (migrate) of the expand/migrate/contract move to millisecond precision.

PRECONDITION: the dual-write (server commit 592587b) must be deployed BEFORE this runs.
Otherwise rows inserted while the backfill is running keep occurred_at_ms = NULL. The script
has no snapshot of max(id): it walks forward until nothing is left, so it also catches the
rows written between the dual-write deploy and the start. The final check still exits
non-zero if anything is left NULL; re-running is always safe (idempotent).

Usage:
    DATABASE_URL=postgresql://... uv run python backfill.py --table events
"""

import logging
import os
import time
from typing import Annotated

import psycopg
import typer
from psycopg import sql
from psycopg.errors import DeadlockDetected, LockNotAvailable, SerializationFailure

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("backfill")

RETRYABLE = (LockNotAvailable, DeadlockDetected, SerializationFailure)
STATS_EVERY_N_BATCHES = 20
VACUUM_POLL_SECONDS = 5.0


def table_ident(table: str) -> sql.Identifier:
    if "." in table:
        raise typer.BadParameter("pass an unqualified name; the table must be in public schema")
    return sql.Identifier(table)


def log_stats(connection: psycopg.Connection, table: str, label: str) -> int:
    ident = table_ident(table)
    to_fill, total = connection.execute(
        sql.SQL("SELECT count(*) FILTER (WHERE occurred_at_ms IS NULL), count(*) FROM {}").format(
            ident
        )
    ).fetchone()
    size, size_pretty = connection.execute(
        "SELECT pg_total_relation_size(%s::regclass), "
        "pg_size_pretty(pg_total_relation_size(%s::regclass))",
        (table, table),
    ).fetchone()
    live, dead, last_autovacuum, last_vacuum, autovacuum_count = connection.execute(
        "SELECT n_live_tup, n_dead_tup, last_autovacuum, last_vacuum, autovacuum_count "
        "FROM pg_stat_user_tables WHERE relid = %s::regclass",
        (table,),
    ).fetchone()
    log.info("%s: to_fill=%d total=%d", label, to_fill, total)
    log.info("%s: table_size=%d (%s)", label, size, size_pretty)
    log.info(
        "%s: live_tuples=%d dead_tuples=%d last_autovacuum=%s last_vacuum=%s autovacuum_count=%d",
        label,
        live,
        dead,
        last_autovacuum,
        last_vacuum,
        autovacuum_count,
    )
    return to_fill


def dead_ratio(connection: psycopg.Connection, table: str) -> float:
    live, dead = connection.execute(
        "SELECT n_live_tup, n_dead_tup FROM pg_stat_user_tables WHERE relid = %s::regclass",
        (table,),
    ).fetchone()
    return dead / max(live, 1)


def wait_for_vacuum(connection: psycopg.Connection, table: str, max_dead_ratio: float) -> None:
    """Block while dead tuples exceed the threshold, i.e. while autovacuum is behind us."""
    while (ratio := dead_ratio(connection, table)) > max_dead_ratio:
        log.warning(
            "dead/live ratio %.2f > %.2f, pausing %.0fs for autovacuum",
            ratio,
            max_dead_ratio,
            VACUUM_POLL_SECONDS,
        )
        time.sleep(VACUUM_POLL_SECONDS)


def run_batch(
    connection: psycopg.Connection, table: str, last_id: int, batch_size: int, max_retries: int
) -> tuple[int, int]:
    """Update one batch after last_id. Returns (rows_updated, new_last_id).

    Keyset pagination: the batch always holds up to batch_size rows regardless of gaps in id,
    and PK-ordered scanning keeps each batch cheap.
    """
    query = sql.SQL(
        """
        WITH batch AS (
            SELECT id FROM {t}
            WHERE id > %s AND occurred_at_ms IS NULL
            ORDER BY id
            LIMIT %s
        )
        UPDATE {t} SET occurred_at_ms = occurred_at
        FROM batch WHERE {t}.id = batch.id
        RETURNING {t}.id
        """
    ).format(t=table_ident(table))

    for attempt in range(1, max_retries + 1):
        try:
            with connection.transaction():
                ids = [row[0] for row in connection.execute(query, (last_id, batch_size))]
            return len(ids), max(ids, default=last_id)
        except RETRYABLE as exc:
            if attempt == max_retries:
                raise
            backoff = 2**attempt
            log.warning(
                "batch after id=%d failed (%s), retry %d/%d in %ds",
                last_id,
                type(exc).__name__,
                attempt,
                max_retries,
                backoff,
            )
            time.sleep(backoff)
    raise AssertionError("unreachable")


def backfill(
    table: Annotated[str, typer.Option(help="Unqualified table name in the public schema")],
    batch_size: Annotated[int, typer.Option(min=1)] = 3000,
    sleep_factor: Annotated[
        float, typer.Option(min=0, help="Pause = batch duration * factor (1.0 is ~50% duty)")
    ] = 1.0,
    max_dead_ratio: Annotated[
        float, typer.Option(min=0, help="Pause while n_dead_tup / n_live_tup is above this")
    ] = 0.2,
    lock_timeout_ms: Annotated[int, typer.Option(min=1)] = 2000,
    statement_timeout_ms: Annotated[int, typer.Option(min=1)] = 30000,
    max_retries: Annotated[int, typer.Option(min=1)] = 5,
) -> None:
    # autocommit: session settings must not be rolled back with a batch; each batch opens its
    # own explicit transaction in run_batch.
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as connection:
        db, user, schema = connection.execute(
            "SELECT current_database(), current_user, current_schema()"
        ).fetchone()
        log.info(
            "target: db=%s user=%s schema=%s table=%s batch_size=%d",
            db,
            user,
            schema,
            table,
            batch_size,
        )
        if schema != "public":
            log.error("current_schema is %s, expected public; check search_path", schema)
            raise typer.Exit(1)

        # Fail fast instead of queueing behind someone's lock (and blocking others behind us).
        connection.execute(
            "SELECT set_config('lock_timeout', %s, false), set_config('statement_timeout', %s, false)",
            (f"{lock_timeout_ms}ms", f"{statement_timeout_ms}ms"),
        )
        connection.execute(sql.SQL("ANALYZE {}").format(table_ident(table)))
        log_stats(connection, table, "before")

        last_id = 0
        batches = 0
        total_updated = 0
        try:
            while True:
                started = time.perf_counter()
                updated, last_id = run_batch(connection, table, last_id, batch_size, max_retries)
                if updated == 0:
                    break
                batches += 1
                total_updated += updated
                elapsed = time.perf_counter() - started
                log.info(
                    "batch=%d last_id=%d updated=%d elapsed_ms=%.1f total_updated=%d",
                    batches,
                    last_id,
                    updated,
                    elapsed * 1000,
                    total_updated,
                )
                if batches % STATS_EVERY_N_BATCHES == 0:
                    wait_for_vacuum(connection, table, max_dead_ratio)
                time.sleep(elapsed * sleep_factor)
        except KeyboardInterrupt:
            log.warning("interrupted after last_id=%d; safe to re-run", last_id)
            raise typer.Exit(130)
        except Exception:
            log.exception("failed after last_id=%d; safe to re-run", last_id)
            raise typer.Exit(1)

        to_fill = log_stats(connection, table, "after")
        if to_fill != 0:
            log.error("after: %d rows still have occurred_at_ms IS NULL", to_fill)
            raise typer.Exit(1)
        log.info("done: %d rows updated in %d batches", total_updated, batches)


if __name__ == "__main__":
    typer.run(backfill)
