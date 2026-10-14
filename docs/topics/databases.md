# Databases (PostgreSQL)

Covers: transactions, ACID, isolation levels, lost update, deadlocks, locking, indexes (B-tree, BRIN, partial), partitioning, EXPLAIN, materialized views.

## The problem it solves
Many clients read and write the same data at the same time, and machines crash halfway through an operation. The database must keep data **correct** (no half-applied changes, no lost writes) and **fast** (queries that don't read everything) as volume grows.

## Mental model
**Transaction** = a group of operations that behave as one. **ACID**:
- **A**tomic: all or nothing.
- **C**onsistent: constraints hold before and after.
- **I**solated: concurrent transactions don't see each other's half-done work (to a degree you choose).
- **D**urable: once committed, survives a crash (WAL).

Postgres uses **MVCC**: writers don't block readers; each transaction sees a snapshot. Conflicts appear only between writers touching the same rows.

```
Tx A: read counter=5 ----------- write 6 -- commit
Tx B:      read counter=5 -- write 6 -- commit      => final 6, should be 7  (lost update)
```

**Isolation levels** (what each prevents in Postgres):

| Level | Dirty read | Non-repeatable read | Phantom | Lost update / write skew |
|-------|-----------|---------------------|---------|--------------------------|
| READ COMMITTED (default) | prevented | possible | possible | possible |
| REPEATABLE READ | prevented | prevented | prevented (snapshot) | write skew possible; update conflicts abort with error |
| SERIALIZABLE | prevented | prevented | prevented | prevented (aborts with serialization failure) |

## Trade-offs and when to choose what

**Fixing a lost update:**

| Technique | How it works | Good when | Cost |
|-----------|--------------|-----------|------|
| Atomic `UPDATE x = x + 1` | DB does read-modify-write under the row lock | simple counters, increments | none; best default |
| `SELECT ... FOR UPDATE` | explicit row lock until commit | read, compute in app, write back | writers queue; longer lock hold; deadlock risk |
| Optimistic (version column) | `UPDATE ... WHERE version = $v`; 0 rows -> retry | low contention, user think-time | retries under contention; needs retry logic |
| SERIALIZABLE | DB detects conflicts and aborts one | complex invariants across rows | must retry; some throughput loss |

**Index types:**

| Index | Best for | Notes |
|-------|----------|-------|
| B-tree | equality, ranges, sorting; the default | size ~ table; slows writes |
| BRIN | huge append-only tables where the column correlates with physical order (timestamps) | tiny; useless if data is not physically ordered |
| Partial | a hot subset (`WHERE status = 'open'`) | small and fast; the query must match the predicate |
| Composite | multi-column filters | column order matters (leftmost prefix) |

**Partitioning (by time):** queries that filter on time touch only relevant partitions (**pruning**); dropping an old partition replaces a huge `DELETE`. Cost: more operational complexity; unique constraints must include the partition key; queries without the key scan all partitions.

**Materialized view:** precomputed query result. Fast reads, stale data until refreshed. Choose when reads are heavy and slight staleness is fine; otherwise maintain an aggregate table incrementally.

## Failure modes and how to reason about them
- **Lost update:** two transactions read the same value, both write. Reason: "is this a read-modify-write in the application across statements?" If yes, it is a candidate.
- **Write skew:** two transactions each check an invariant on different rows, then both write; invariant breaks. Only SERIALIZABLE (or explicit locking of a shared row) prevents it.
- **Deadlock:** A holds lock 1 wants 2; B holds 2 wants 1. Postgres detects it and kills one. Prevent with a consistent lock order and short transactions.
- **Long transactions:** hold locks, block vacuum, bloat tables. Keep transactions short; no network calls inside.
- **Hot row:** many writers on one row serialize. Shard the counter (N rows, sum on read) or batch updates.
- **Slow query diagnosis order:** `EXPLAIN (ANALYZE, BUFFERS)` -> is it a seq scan on a big table? estimated vs actual rows far apart (stale stats)? sort spilling to disk? -> fix index/query/statistics -> re-measure.
- **Missing index vs wrong index:** an index is ignored if the predicate can't use it (function on the column, type mismatch, low selectivity, leading column missing).

## Key details that matter
- READ COMMITTED: each statement sees data committed before **that statement** started. REPEATABLE READ: whole transaction sees one snapshot.
- Under REPEATABLE READ / SERIALIZABLE the application **must retry** on serialization failure (`40001`) and deadlock (`40P01`).
- `UPDATE` takes a row lock; a second concurrent `UPDATE` on the row waits, then (at READ COMMITTED) **re-evaluates** the row on the new version. That is why `x = x + 1` is safe and `x = $value_read_earlier` is not.
- `INSERT ... ON CONFLICT DO NOTHING` makes inserts idempotent when a unique key exists. This is the basis of idempotent consumers.
- Reading a plan: node type (Seq Scan, Index Scan, Bitmap, Index Only), `rows` estimated vs actual, `Buffers: shared hit/read`, `loops`. Buffers read means disk/cache misses; hit means cache.
- Bulk load: `COPY` is far faster than row-by-row inserts; batch inserts beat single ones because of per-statement and per-commit overhead.

## In 30 seconds
"A transaction groups operations so they succeed or fail together; the isolation level decides which concurrency anomalies you tolerate. The classic bug is a lost update: two transactions read the same value and both write back. The best fix is usually an atomic update in SQL; otherwise lock the row or use a version column and retry. Higher isolation costs throughput and requires retries. For performance, I read the EXPLAIN plan first and add the cheapest index that matches the query; for huge time-series tables I partition by time so queries prune and retention is a partition drop."

**Follow-ups:**
- *Why is `x = x + 1` safe at READ COMMITTED?* The row lock makes the second writer wait and re-read the latest committed value.
- *Optimistic vs pessimistic?* Optimistic detects conflicts at write and retries (cheap when rare); pessimistic locks first (predictable under high contention, but blocks).
- *When SERIALIZABLE?* Multi-row invariants (write skew) where explicit locking is awkward, and you can afford retries.
- *B-tree vs BRIN?* B-tree is precise and large; BRIN is tiny and works only when values correlate with physical order.
- *Why can adding an index make things worse?* Every write updates it; and the planner may not use it.
- *Query got slow after a month of growth, what do you check?* Plan changed to seq scan, stale statistics, table/index bloat, missing partition pruning.

## In Live Pulse
_Stub. Claude fills as the project progresses._
- Experiments: E1 (lost update), E2 (isolation + deadlock), E3 (EXPLAIN, B-tree vs BRIN) in [EXPERIMENTS.md](../EXPERIMENTS.md).
- Issues / PRs: _(none yet)_

## Lessons from building it
_Stub. Real findings go here._
