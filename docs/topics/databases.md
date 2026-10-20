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

Postgres uses **MVCC** (multi-version concurrency control): a change does not overwrite a row, it creates a **new version** of it, and each transaction sees the versions that were committed before its snapshot. So writers don't block readers, and two writers wait for each other only when they touch **the same row or the same unique key**, never just because they write to the same table.

```
page (8 KB)
  slots (pointers)         row versions (tuples), each with xmin / xmax
  slot 1 -> ................ [ a | xmin=741 xmax=742 ]   replaced by tx 742
  slot 2 -> ................ [ b | xmin=742 xmax=743 ]   being replaced by tx 743 (not committed)
  slot 3 -> ................ [ c | xmin=743 xmax=0   ]   current version
```
`xmin` = the transaction that created the version, `xmax` = the one that deleted or replaced it (`0` = alive). A reader whose snapshot is older than 743's commit still sees `b`.

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
- **Row versions:** every `UPDATE` creates a new version; the old one stays until no snapshot can see it, then it is removed by opportunistic page pruning, autovacuum (by default when dead rows exceed 50 + 20% of the table) or a manual `VACUUM`. Reads create no versions, so what drives bloat is the **rate of updates/deletes** and the **age of the oldest open transaction**, not the number of readers.
- **Page and slot:** a table file is split into 8 KB pages; a page holds many versions (live and dead) of many rows. A version is addressed by `ctid = (page, slot)`; the slot is a pointer to the bytes inside the page, so the database can compact a page (move live versions together to merge the holes left by removed ones) by changing only slot offsets, and indexes stay valid. Moving a version to another page changes its address, which is why that only happens in a table rewrite (`VACUUM FULL`, `CLUSTER`), which locks the table.
- **What blocks what:** insert vs insert on different keys, and read vs write, never wait. Two updates of one row wait (the second waits for the first to end). Two inserts of the **same unique key** wait: the second waits for the first transaction to finish, then gets a conflict (`DO NOTHING` skips it) if the first committed, or inserts if it rolled back. `TRUNCATE`, `ALTER TABLE`, `DROP` lock the whole table and wait for everyone.
- **Why check-then-insert is unsafe:** at READ COMMITTED a `SELECT` does not see an uncommitted row of a concurrent transaction, so both transactions see "not found" and both insert. `ON CONFLICT` folds the check and the write into one atomic operation inside the database.
- `SELECT xmin, xmax, ctid, * FROM t` shows the version fields; the `pageinspect` extension (`heap_page_items`) shows the dead versions still in the page.

## In 30 seconds
"A transaction groups operations so they succeed or fail together; the isolation level decides which concurrency anomalies you tolerate. The classic bug is a lost update: two transactions read the same value and both write back. The best fix is usually an atomic update in SQL; otherwise lock the row or use a version column and retry. Higher isolation costs throughput and requires retries. Under the hood Postgres keeps several versions of a row (MVCC), so readers never wait for writers; waiting happens only between writers on the same row or unique key, and the price is dead versions that vacuum must clean. For performance, I read the EXPLAIN plan first and add the cheapest index that matches the query; for huge time-series tables I partition by time so queries prune and retention is a partition drop."

**Follow-ups:**
- *Why is `x = x + 1` safe at READ COMMITTED?* The row lock makes the second writer wait and re-read the latest committed value.
- *Optimistic vs pessimistic?* Optimistic detects conflicts at write and retries (cheap when rare); pessimistic locks first (predictable under high contention, but blocks).
- *When SERIALIZABLE?* Multi-row invariants (write skew) where explicit locking is awkward, and you can afford retries.
- *B-tree vs BRIN?* B-tree is precise and large; BRIN is tiny and works only when values correlate with physical order.
- *Why can adding an index make things worse?* Every write updates it; and the planner may not use it.
- *Query got slow after a month of growth, what do you check?* Plan changed to seq scan, stale statistics, table/index bloat, missing partition pruning.
- *Do two writes to the same table block each other?* No. They wait only if they touch the same row or the same unique key (or one of them takes a table-level lock such as `TRUNCATE`).
- *Why can a table bloat, and what makes it worse?* Updates leave old versions until vacuum removes them; a long open transaction (an old snapshot) prevents removal.
- *Two requests insert the same `event_id` at once. What happens?* The unique index lets one through; the other waits for it to finish, then `ON CONFLICT DO NOTHING` skips the row (or inserts it if the first rolled back).

## In Live Pulse
- `events` table (migration `0001`): append-only, `event_id` has a unique constraint. `POST /events` runs `INSERT ... ON CONFLICT (event_id) DO NOTHING`; the number of inserted rows decides `201` (new) or `200` (duplicate). Issue #1, PR #3; the decisions are in [DECISIONS.md](../DECISIONS.md).
- The e2e tests run on a throwaway Postgres (own container, tmpfs, own port), so `TRUNCATE` never touches the dev database.
- Experiments: E1 (lost update), E2 (isolation + deadlock), E3 (EXPLAIN, B-tree vs BRIN) in [EXPERIMENTS.md](../EXPERIMENTS.md).
- Issues / PRs: #1 / PR #3

## Lessons from building it
- **Idempotency needs a key the client controls plus a constraint the database enforces.** A check in application code races: under READ COMMITTED both of two simultaneous requests see "not found". (#1, quiz.)
- **Conflicts are over rows and keys, not tables.** A common wrong model is "writes to one table queue up". Two inserts into `events` run in parallel; only the same `event_id` makes one wait. (Caught in the #1 quiz.)
- **Seeing MVCC in a real table** (`pageinspect`): tx 741 inserts `a` (`xmin=741`); tx 742 updates it to `b`, so slot 1 gets `xmax=742` and the new version sits in slot 2; while tx 743 had updated to `c` but not committed, a reader still saw `b` (`xmax=743` already on it) and did not wait; after `VACUUM` slots 1 and 2 were freed and only `c` remained.
- **`events` is append-only, so it makes almost no dead versions.** Bloat and vacuum become a real concern for counters and aggregates that are updated constantly (Stage 2 and later).
- **A reused `event_id` with a different body is dropped silently** (first wins). Cheap to change later; see the decision log.
