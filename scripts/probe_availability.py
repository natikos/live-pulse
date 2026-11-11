"""Availability probe to run alongside a deploy (migration + app restart).

Two independent threads, each with its own connection, hit the table at a fixed rate:
  - read:   SELECT the newest row id
  - insert: INSERT a marked probe row (user_id = 'probe-availability')

Two threads, so that an INSERT stuck behind a DDL lock never delays the read probe.
DDL rarely makes a probe fail, it makes it wait: every operation is timed, and
lock_timeout / statement_timeout / connect_timeout turn "waiting forever" into an error.
Errors never stop a probe: they are counted, and the connection is re-established.

The INSERT looks up which of occurred_at / occurred_at_ms exist, so it keeps working through
the expand / migrate / contract steps. The lookup is repeated after every failed insert.

Probe rows are deleted at the end (--no-cleanup keeps them); rows left by an aborted run
are caught by the next cleanup because they are matched by user_id.

Usage:
    uv run --env-file .env probe_availability.py --table events --timeout 10
"""

import logging
import os
import threading
import time
import uuid
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import partial
from types import TracebackType
from typing import Annotated, Self

import psycopg
import typer
from psycopg import sql
from psycopg.abc import Params, QueryNoTemplate
from psycopg.types.json import Jsonb

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s [%(threadName)s] %(message)s"
)
log = logging.getLogger("probe_availability")

PROBE_USER_ID = "probe-availability"
CONNECT_TIMEOUT_SECONDS = 5


class ReconnectingConnection:
    connection: psycopg.Connection | None

    def __init__(self, dsn: str, *, lock_timeout_ms: int, statement_timeout_ms: int):
        self.dsn = dsn
        self.options = (
            f"-c lock_timeout={lock_timeout_ms} -c statement_timeout={statement_timeout_ms}"
        )
        self.connection = None

    def _ensure_connected(self) -> psycopg.Connection:
        if self.connection is None or self.connection.closed:
            # autocommit: a probe must never hold a transaction open, it would block the DDL.
            # prepare_threshold=None: no server-side prepared statements, so a plan cached
            # before the DDL cannot fail after it.
            self.connection = psycopg.connect(
                self.dsn,
                autocommit=True,
                prepare_threshold=None,
                connect_timeout=CONNECT_TIMEOUT_SECONDS,
                options=self.options,
            )
            log.info("Database connected")
        return self.connection

    def execute(self, query: QueryNoTemplate, params: Params | None = None) -> psycopg.Cursor:
        conn = self._ensure_connected()
        return conn.execute(query, params)

    def close(self):
        if self.connection is not None and not self.connection.closed:
            self.connection.close()
        self.connection = None

    def __enter__(self) -> Self:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()


Operation = Callable[[ReconnectingConnection], str]


def table_ident(table: str) -> sql.Identifier:
    if "." in table:
        raise typer.BadParameter("pass an unqualified name; the table must be in public schema")
    return sql.Identifier(table)


def first_line(error: Exception) -> str:
    lines = str(error).strip().splitlines()
    return lines[0] if lines else ""


class ReadProbe:
    def __init__(self, table: str):
        self._query = sql.SQL("SELECT id FROM {} ORDER BY created_at DESC LIMIT 1").format(
            table_ident(table)
        )

    def __call__(self, db: ReconnectingConnection) -> str:
        row = db.execute(self._query).fetchone()
        return "table is empty" if row is None else f"id={row[0]}"


class InsertProbe:
    def __init__(self, table: str, run_id: str):
        self._table = table
        self._run_id = run_id
        self._query: sql.Composed | None = None

    def _build_query(self, db: ReconnectingConnection) -> sql.Composed:
        rows = db.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = %s "
            "AND column_name IN ('occurred_at', 'occurred_at_ms') ORDER BY column_name",
            (self._table,),
        ).fetchall()
        timestamp_columns = [row[0] for row in rows]
        if not timestamp_columns:
            raise RuntimeError(f"no occurred_at / occurred_at_ms column in {self._table}")
        log.info("insert columns: %s", timestamp_columns)

        columns = ["event_id", "type", "payload", "source", "user_id", *timestamp_columns]
        values = [
            sql.Placeholder(),
            sql.SQL("'page_view'"),
            sql.Placeholder(),
            sql.SQL("'server'"),
            sql.Placeholder(),
            *[sql.SQL("now()")] * len(timestamp_columns),
        ]
        return sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
            table_ident(self._table),
            sql.SQL(", ").join(map(sql.Identifier, columns)),
            sql.SQL(", ").join(values),
        )

    def __call__(self, db: ReconnectingConnection) -> str:
        try:
            if self._query is None:
                self._query = self._build_query(db)
            event_id = uuid.uuid4()
            db.execute(self._query, (event_id, Jsonb({"probe_run": self._run_id}), PROBE_USER_ID))
        except Exception:
            self._query = None  # the schema may have changed, look again next time
            raise
        return f"event_id={event_id}"


@dataclass
class Stats:
    name: str
    ok: int = 0
    failed: int = 0
    slow: int = 0
    latencies_ms: list[float] = field(default_factory=list)
    errors: Counter[str] = field(default_factory=Counter)
    longest_outage_s: float = 0.0
    _outage_start: float | None = field(default=None, init=False, repr=False)
    _last_failure_end: float = field(default=0.0, init=False, repr=False)

    def record(self, started: float, finished: float, error: Exception | None, slow_s: float):
        self.latencies_ms.append((finished - started) * 1000)
        if error is not None:
            self.failed += 1
            self.errors[type(error).__name__] += 1
            if self._outage_start is None:
                self._outage_start = started
            self._last_failure_end = finished
            return
        self.ok += 1
        if finished - started > slow_s:
            self.slow += 1
        self._close_outage()

    def _close_outage(self):
        if self._outage_start is not None:
            outage = self._last_failure_end - self._outage_start
            self.longest_outage_s = max(self.longest_outage_s, outage)
            self._outage_start = None

    def _percentile_ms(self, p: float) -> float:
        ordered = sorted(self.latencies_ms)
        return ordered[min(len(ordered) - 1, int(len(ordered) * p))] if ordered else 0.0

    def log_summary(self):
        self._close_outage()
        log.info(
            "%s: total=%d ok=%d failed=%d slow=%d p50=%.0fms p99=%.0fms max=%.0fms "
            "longest_outage=%.1fs errors=%s",
            self.name,
            self.ok + self.failed,
            self.ok,
            self.failed,
            self.slow,
            self._percentile_ms(0.5),
            self._percentile_ms(0.99),
            max(self.latencies_ms, default=0.0),
            self.longest_outage_s,
            dict(self.errors) or "none",
        )


def run_probe(
    operation: Operation,
    stats: Stats,
    dsn: str,
    stop: threading.Event,
    interval_s: float,
    slow_s: float,
    lock_timeout_ms: int,
    statement_timeout_ms: int,
):
    next_tick = time.perf_counter()
    with ReconnectingConnection(
        dsn, lock_timeout_ms=lock_timeout_ms, statement_timeout_ms=statement_timeout_ms
    ) as db:
        while not stop.is_set():
            started = time.perf_counter()
            error = None
            detail = ""
            try:
                detail = operation(db)
            except Exception as exc:  # noqa: BLE001  a probe must survive whatever a deploy does
                error = exc
            finished = time.perf_counter()
            stats.record(started, finished, error, slow_s)

            elapsed_ms = (finished - started) * 1000
            if error is not None:
                log.error(
                    "failed after %.0fms: %s: %s",
                    elapsed_ms,
                    type(error).__name__,
                    first_line(error),
                )
            elif finished - started > slow_s:
                log.warning("slow: %s took %.0fms", detail, elapsed_ms)
            else:
                log.info("ok: %s took %.0fms", detail, elapsed_ms)

            # Fixed rate, measured from the tick start: a slow operation must not stretch the
            # schedule. If we fell behind, skip the missed ticks instead of firing a burst.
            next_tick = max(next_tick + interval_s, time.perf_counter())
            stop.wait(next_tick - time.perf_counter())


def cleanup(dsn: str, table: str):
    with ReconnectingConnection(dsn, lock_timeout_ms=30_000, statement_timeout_ms=60_000) as db:
        deleted = db.execute(
            sql.SQL("DELETE FROM {} WHERE user_id = %s").format(table_ident(table)),
            (PROBE_USER_ID,),
        ).rowcount
    log.info("cleanup: deleted %d probe rows", deleted)


def probe_availability(
    timeout: Annotated[int, typer.Option(min=1, help="Live time for script in minutes")],
    table: Annotated[str, typer.Option(help="Unqualified table name in the public schema")],
    interval: Annotated[
        float, typer.Option(min=0.05, help="Seconds between probes (per thread)")
    ] = 1.0,
    lock_timeout_ms: Annotated[
        int, typer.Option(min=1, help="Give up waiting for a lock after this long")
    ] = 2000,
    statement_timeout_ms: Annotated[
        int, typer.Option(min=1, help="Abort a single statement after this long")
    ] = 5000,
    slow_ms: Annotated[
        int, typer.Option(min=1, help="Operations slower than this count as degraded")
    ] = 500,
    do_cleanup: Annotated[
        bool, typer.Option("--cleanup/--no-cleanup", help="Delete probe rows at the end")
    ] = True,
):
    database_url = os.environ["DATABASE_URL"]
    table_ident(table)  # fail on a bad name before anything starts

    with psycopg.connect(database_url, autocommit=True) as connection:
        row = connection.execute("SELECT current_database(), current_user").fetchone()
        assert row is not None, "SELECT without FROM must return exactly one row"
        db, user = row
        log.info("target: db=%s user=%s table=%s time=%i", db, user, table, timeout)

    run_id = uuid.uuid4().hex[:8]
    stop = threading.Event()
    probes: dict[str, Operation] = {
        "read": ReadProbe(table),
        "insert": InsertProbe(table, run_id),
    }
    stats = {name: Stats(name) for name in probes}
    threads = [
        threading.Thread(
            target=partial(
                run_probe,
                operation,
                stats[name],
                database_url,
                stop,
                interval,
                slow_ms / 1000,
                lock_timeout_ms,
                statement_timeout_ms,
            ),
            name=name,
        )
        for name, operation in probes.items()
    ]
    for thread in threads:
        thread.start()

    try:
        stop.wait(timeout * 60)
    except KeyboardInterrupt:
        log.info("interrupted, stopping")
    finally:
        stop.set()
        for thread in threads:
            thread.join()

    for probe_stats in stats.values():
        probe_stats.log_summary()

    if not do_cleanup:
        log.info("probe rows kept: DELETE FROM %s WHERE user_id = '%s'", table, PROBE_USER_ID)
        return
    try:
        cleanup(database_url, table)
    except psycopg.Error as e:
        log.error(
            "cleanup failed (%s), run manually: DELETE FROM %s WHERE user_id = '%s'",
            first_line(e),
            table,
            PROBE_USER_ID,
        )


if __name__ == "__main__":
    typer.run(probe_availability)
