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
