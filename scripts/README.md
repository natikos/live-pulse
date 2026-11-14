# scripts/ - Python tooling

Everything auxiliary lives here: event generator, DB seeding, concurrency repros, load tests, result analysis.
The NestJS/React app never imports from this folder.

## Setup (uv)

```bash
cd scripts
uv sync                 # creates .venv, installs deps + dev group
uv run python --version
uv run ruff check .     # lint
uv run pytest           # tests (once they exist)
```

Without uv:

```bash
cd scripts
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e . ruff pytest
```

Optional gRPC client (Stage 5): `uv sync --extra grpc`.

## Running the scripts

The scripts take the database from `DATABASE_URL`. They do not read `.env` themselves; uv loads it with
`--env-file`. Create `scripts/.env` once (it is git-ignored), with the credentials from the root `.env`:

```bash
cd scripts
echo 'DATABASE_URL=postgresql://<user>:<password>@localhost:5432/livepulse' > .env
```

Every example below is run from `scripts/`. Add `--help` to any of them to see the options.
To skip typing `--env-file .env` each time: `export UV_ENV_FILE=.env`.

### seed_events_prod.py

Bulk-loads synthetic events shaped like production with `COPY`, then runs `ANALYZE`. The same options always give the same rows.
It **always empties `events` first** (restarting its ids), in the same transaction as the load, so a failed load leaves the table as it was. Local use only.

The data: `created_at = occurred_at + lag` (never in the future), rows inserted in `created_at` order, `occurred_at` spread over 5 days with a spike and a ramp near the end, and type mix and payloads that depend on the group. The requirements are in the docstring of the script.

| Option | Default | Meaning |
|--------|---------|---------|
| `--rows` | `10` | How many events to insert |
| `--seed` | `42` | Seed of the random generator |
| `--end` | the current hour, UTC | End of the window, UTC. Formats: `2026-11-02`, `2026-11-02T12:00:00` |

The connection string comes from `$DATABASE_URL`. The script logs one line per step with timings and the group and type mix.

```bash
# 10 events
uv run --env-file .env seed_events_prod.py

# 1M events for the list measurements
uv run --env-file .env seed_events_prod.py --rows 1000000

# a different sample, and a fixed end of the window
uv run --env-file .env seed_events_prod.py --rows 1000000 --seed 7 --end 2026-11-02
```

### probe_availability.py

Runs next to a deploy (migration and app restart). Two threads read the newest row and insert a marked probe row
at a fixed rate and count the failures and slow operations.

| Option | Default | Meaning |
|--------|---------|---------|
| `--timeout` | required | How long to run, in minutes |
| `--table` | required | Table name in the `public` schema |
| `--interval` | `1.0` | Seconds between probes, per thread |
| `--lock-timeout-ms` | `2000` | Give up waiting for a lock after this long |
| `--statement-timeout-ms` | `5000` | Abort a single statement after this long |
| `--slow-ms` | `500` | Operations slower than this count as degraded |
| `--cleanup` / `--no-cleanup` | cleanup | Delete the probe rows at the end |

```bash
# 10 minutes against events
uv run --env-file .env probe_availability.py --table events --timeout 10

# every option
uv run --env-file .env probe_availability.py --table events --timeout 10 --interval 0.5 \
  --lock-timeout-ms 2000 --statement-timeout-ms 5000 --slow-ms 500 --no-cleanup
```

### backfill.py

A historical script from the move to millisecond precision: it fills `occurred_at_ms` from `occurred_at` in small,
throttled batches. It needs the `occurred_at_ms` column, which migration 0003 replaces, so it does not run on the
current schema.

| Option | Default | Meaning |
|--------|---------|---------|
| `--table` | required | Table name in the `public` schema |
| `--batch-size` | `3000` | Rows per batch |
| `--sleep-factor` | `1.0` | Pause = batch duration * factor (1.0 is about 50% duty) |
| `--max-dead-ratio` | `0.2` | Pause while `n_dead_tup / n_live_tup` is above this |
| `--lock-timeout-ms` | `2000` | Give up waiting for a lock after this long |
| `--statement-timeout-ms` | `30000` | Abort a single statement after this long |
| `--max-retries` | `5` | Retries of a batch after a lock or serialization failure |

```bash
uv run --env-file .env backfill.py --table events

# every option
uv run --env-file .env backfill.py --table events --batch-size 3000 --sleep-factor 1.0 \
  --max-dead-ratio 0.2 --lock-timeout-ms 2000 --statement-timeout-ms 30000 --max-retries 5
```

## Planned layout (created as tickets need it)

| Path | Purpose | Stage |
|------|---------|-------|
| `seed/` | bulk-load events with `COPY` | 1 |
| `generator/` | publish synthetic events (HTTP, then Kafka) | 1-2 |
| `concurrency/` | lost update / deadlock reproductions | 2 |
| `rabbit/` | poison messages, retry and DLQ tests | 2b |
| `load/` | Locust scenarios | 4 |
| `analysis/` | matplotlib charts from results | 4 |
| `out/` | generated results (git-ignored) | - |

Syntax I want to memorize goes to [docs/PYTHON_NOTES.md](../docs/PYTHON_NOTES.md).
