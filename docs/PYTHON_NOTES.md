# Python notes

Cheat sheet for syntax to memorize while writing `scripts/`. Claude adds short entries whenever a new construct appears in scripts or reviews. Python 3.12+.

## asyncio
```python
import asyncio

async def fetch(i: int) -> int:
    await asyncio.sleep(0.1)          # yields to the event loop
    return i

async def main() -> None:
    results = await asyncio.gather(*(fetch(i) for i in range(10)))   # run concurrently
    async with asyncio.TaskGroup() as tg:                            # structured concurrency (3.11+)
        t = tg.create_task(fetch(1))
    print(results, t.result())

asyncio.run(main())                   # entry point; one per program
```
- `await` only inside `async def`. Blocking calls (`time.sleep`, sync DB driver) freeze the loop.
- Limit concurrency with `asyncio.Semaphore(n)`.
- Similar to JS `Promise.all` = `gather`.

## Context managers
```python
with open("f.txt") as f:             # closes on exit, even on exception
    data = f.read()

from contextlib import contextmanager, asynccontextmanager

@contextmanager
def timer(label: str):
    import time; t = time.perf_counter()
    try:
        yield
    finally:
        print(label, time.perf_counter() - t)

async with pool.connection() as conn:   # async variant
    ...
```

## dataclasses
```python
from dataclasses import dataclass, field

@dataclass(frozen=True, slots=True)
class Event:
    id: str
    type: str
    payload: dict = field(default_factory=dict)   # never use a mutable default directly
```

## f-strings
```python
f"{name!r}  {x:.2f}  {n:,}  {n:>8}  {ts:%Y-%m-%d}  {x=}"   # repr, float, thousands, pad, date, debug
```

## Comprehensions
```python
squares = [x * x for x in range(10) if x % 2 == 0]
by_id   = {e.id: e for e in events}
unique  = {e.type for e in events}
lazy    = (x for x in range(10**9))        # generator expression, no memory
```

## typing
```python
from typing import Literal, TypedDict, Protocol, Iterable
def f(xs: list[int], m: dict[str, int] | None = None) -> int: ...     # built-in generics, X | None
Kind = Literal["click", "view"]
class Row(TypedDict): id: int; name: str
class Sink(Protocol):                      # structural typing, like a TS interface
    def write(self, data: bytes) -> None: ...
```

## CLI: argparse / typer
```python
import typer
app = typer.Typer()

@app.command()
def generate(rate: int = 100, duration: int = 60, url: str = "http://localhost:3000"):
    """Generate events."""
    ...

if __name__ == "__main__":
    app()
```
`argparse` equivalent: `p = argparse.ArgumentParser(); p.add_argument("--rate", type=int, default=100); args = p.parse_args()`.

## Virtual environments (uv)
```bash
uv sync                  # create .venv from pyproject.toml
uv run python script.py  # run inside the venv
uv add httpx             # add a dependency
```
Plain: `python -m venv .venv && source .venv/bin/activate`.

## Misc
- `if __name__ == "__main__":` runs only when executed directly, not when imported.
- `pathlib.Path("a") / "b"` for paths.
- `enumerate(xs, start=1)`, `zip(a, b, strict=True)`.
- Unpacking: `first, *rest = xs`; `{**a, **b}` merges dicts.

---
<!-- New entries from scripts and reviews go below, with the date and where they appeared. -->

### 2026-11-11: bulk load with `COPY`, a seeded generator (`scripts/seed_events.py`, #4)
```python
import psycopg, random, uuid
from typing import Annotated
import typer

with psycopg.connect(database_url) as conn:           # one transaction: commit on exit, rollback on error
    with (
        conn.cursor() as cur,
        cur.copy("COPY events (event_id, type) FROM STDIN") as copy,   # several managers in one `with`
    ):
        for row in rows:
            copy.write_row(row)                        # fastest way to load many rows
    conn.execute("ANALYZE events")                     # refresh planner statistics after a big load

rng = random.Random(42)                                # own generator: the same seed gives the same rows
rng.choices(["a", "b"], weights=[90, 10], k=5)         # weighted sampling with replacement
uuid.UUID(int=rng.getrandbits(128), version=4)         # reproducible UUID; uuid4() reads OS entropy

def main(rows: Annotated[int, typer.Option(min=1, envvar="ROWS", help="...")] = 10) -> None: ...
```
- A single `random.Random(seed)` instance keeps results reproducible; the **order of calls** is part of what a seed reproduces.
- `(end - start) // timedelta(milliseconds=1)` gives whole milliseconds as an `int`.
- `row = cur.execute(...).fetchone(); assert row is not None` narrows the type for the checker.
- `enumerate(zip(a, b), start=1)` for a 1-based counter over two lists.

### 2026-11-12: a seeded mixture generator with pytest (`scripts/seed_events_prod.py`)
```python
@dataclass(frozen=True)                                # immutable result object, no boilerplate
class Shares:
    spike: float

rng.uniform(a, b); rng.gauss(mu, sigma); rng.triangular(low, high, mode)   # samples, from one seeded rng
NormalDist().cdf(x)                                    # share of a normal distribution below x: an exact number, not a sample
(end - start) / timedelta(hours=1)                     # timedelta / timedelta is a float; -timedelta works too
zip(a, b, strict=True)                                 # raises if the lengths differ
sorted(zip(created_at, occurred_at))                   # tuples sort by the first item, then the second
def draw_within_window(draw: Callable[[], float], ...) # a function with no arguments passed as a value (collections.abc)
draw_within_window(lambda: rng.uniform(0, n), ...)
```
- Redraw until a value fits instead of clamping it: clamping piles equal values on the edge.
- `if x < 0: raise ValueError(...)` right where a derived number is computed beats a silent wrong distribution later.

```python
@pytest.fixture(scope="module")                        # built once per test file
@pytest.mark.parametrize("room", [a, b, c])            # one test body, several inputs
monkeypatch.setattr(module, "NAME", 0.01)              # change a module constant for one test only
pytest.approx(0.35, abs=0.01)                          # compare floats with a tolerance
with pytest.raises(ValueError): ...
```
- `[tool.pytest.ini_options] pythonpath = ["."]` in `pyproject.toml` lets tests import a script that sits next to them.
