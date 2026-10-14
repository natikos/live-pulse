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
