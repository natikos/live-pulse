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

**Pagination:**

| Technique | How it works | Pros | Cons | Typical use |
|-----------|--------------|------|------|-------------|
| `LIMIT` only | newest N rows, no way to continue | trivial | older rows unreachable; not paging | "latest 10" widgets |
| `OFFSET` / `LIMIT` | skip N rows, take the next page | simple; random access ("page 57"); easy total count | cost grows with depth (reads and discards N rows); rows shift when data changes -> duplicates and gaps | small, rarely-changing tables; admin screens; back-office search |
| Window function (`ROW_NUMBER() OVER`, `COUNT(*) OVER()`) | number all matching rows, filter by number | one query gives page and total | numbers every matching row on every request (O(N), no better than offset); same shifting problem; total is stale at once | analytics ("top 3 per group"), not paging |
| Keyset / seek (`WHERE (a, id) < ($1, $2) ORDER BY a DESC, id DESC`) | continue from the last seen sort key | index seek, O(log N + limit) at any depth; stable under inserts | no jump to page N; no cheap total; needs a unique tie-breaker and an index matching the order; one index per filter + sort combination | feeds, logs, event streams, infinite scroll, large append-only tables |
| Opaque cursor (keyset position encoded in a token) | API contract on top of keyset: server returns `next_cursor`, client sends it back | implementation can change without breaking clients; token can carry a filter hash and be validated | same limits as keyset; must reject tampered or foreign tokens (`400`) | public APIs over keyset (Stripe, GitHub, Slack style) |
| Server-side DB cursor (`DECLARE CURSOR` / `FETCH`) | database keeps the result position open | cheap sequential reads of a huge result; consistent snapshot | holds a transaction and connection between requests; pins one instance; exhausts the pool; stateful | batch export and ETL inside one process, not HTTP APIs |
| Snapshot / ID-range (`WHERE id > $last` with fixed bounds) | split the table into ranges up front | parallel workers; no deep scans | only for a monotonic key; no custom sort | backfills, migrations, parallel exports |

- **Cursor vs keyset are different layers.** Keyset is the SQL technique; a cursor is the API contract that hides it.
- **Total count and random access are the price of keyset.** If the product needs "page 57 of 900", offset (or an estimate) is the honest answer; if it needs a live feed, keyset.
- **Pick the strategy from the data:** small and static -> offset is fine; large, append-heavy or deep -> keyset; both needed -> keyset for navigation, a separate approximate count (`pg_class.reltuples` or a cached counter).

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
- **A snapshot is a value** (`pg_snapshot`, text `xmin:xmax:xip`): every xid below `xmin` had finished, every xid at or above `xmax` had not started, and `xip` lists the ones in flight in between. `pg_current_snapshot()` returns it; `pg_visible_in_snapshot(xid, snapshot)` asks whether a transaction's rows were visible to it. It can be stored and passed to a later request, which is how "what did this reader see" survives between two HTTP calls. In READ COMMITTED every statement takes a new snapshot, so rows and token must come from one statement or one REPEATABLE READ transaction.
- **`id` order is not commit order.** A transaction with a smaller `id` or `xid` can commit after one with a larger value, so "greater than the last I saw" misses it. A time column set by `now()` is the transaction **start**, not the commit. Only a snapshot knows which transactions were still open.
- **`xmin` has 32 bits** (it wraps around, vacuum freezes old rows); `xid8` has 64 (an epoch is added). Casting `xmin` to `xid8` drops the epoch, so it is right only before the first wraparound. Store `pg_current_xact_id()` in a column when you need a stable 64-bit id. Calling it in a read makes the transaction take an xid; `pg_current_snapshot()` does not.
- **A volatile default rewrites the table.** `ADD COLUMN ... DEFAULT <volatile function>` rewrites every row under `ACCESS EXCLUSIVE`. Adding a nullable column and setting the default in a second statement is metadata-only; old rows stay `NULL`.
- `SELECT xmin, xmax, ctid, * FROM t` shows the version fields; the `pageinspect` extension (`heap_page_items`) shows the dead versions still in the page.

## In 30 seconds
"A transaction groups operations so they succeed or fail together; the isolation level decides which concurrency anomalies you tolerate. The classic bug is a lost update: two transactions read the same value and both write back. The best fix is usually an atomic update in SQL; otherwise lock the row or use a version column and retry. Higher isolation costs throughput and requires retries. Under the hood Postgres keeps several versions of a row (MVCC), so readers never wait for writers; waiting happens only between writers on the same row or unique key, and the price is dead versions that vacuum must clean. For performance, I read the EXPLAIN plan first and add the cheapest index that matches the query; for huge time-series tables I partition by time so queries prune and retention is a partition drop."

**Follow-ups:**
- *Why is `x = x + 1` safe at READ COMMITTED?* The row lock makes the second writer wait and re-read the latest committed value.
- *Optimistic vs pessimistic?* Optimistic detects conflicts at write and retries (cheap when rare); pessimistic locks first (predictable under high contention, but blocks).
- *When SERIALIZABLE?* Multi-row invariants (write skew) where explicit locking is awkward, and you can afford retries.
- *B-tree vs BRIN?* B-tree is precise and large; BRIN is tiny and works only when values correlate with physical order.
- *Why not paginate with a window function?* It numbers every matching row on each request, so it is O(N) like offset and shifts the same way.
- *Keyset vs cursor?* Keyset is the SQL (`WHERE (ts, id) < ...`); the cursor is the opaque token that hides it from clients. Cost of keyset: no jump to page N, no cheap total.
- *Why can adding an index make things worse?* Every write updates it; and the planner may not use it.
- *Query got slow after a month of growth, what do you check?* Plan changed to seq scan, stale statistics, table/index bloat, missing partition pruning.
- *Do two writes to the same table block each other?* No. They wait only if they touch the same row or the same unique key (or one of them takes a table-level lock such as `TRUNCATE`).
- *Why can a table bloat, and what makes it worse?* Updates leave old versions until vacuum removes them; a long open transaction (an old snapshot) prevents removal.
- *How do you tell a reader that rows arrived after the page they are looking at, when commits finish out of order?* Take a snapshot together with the page (one transaction) and later ask for rows not visible in it. `id > last seen` misses a row whose transaction committed later; `now()` is the start of the transaction, not the commit.
- *Two requests insert the same `event_id` at once. What happens?* The unique index lets one through; the other waits for it to finish, then `ON CONFLICT DO NOTHING` skips the row (or inserts it if the first rolled back).

## In Live Pulse
- `events` table (migration `0001`): append-only, `event_id` has a unique constraint. `POST /events` runs `INSERT ... ON CONFLICT (event_id) DO NOTHING`; the number of inserted rows decides `201` (new) or `200` (duplicate). Issue #1, PR #3; the decisions are in [DECISIONS.md](../DECISIONS.md).
- The e2e tests run on a throwaway Postgres (own container, tmpfs, own port), so `TRUNCATE` never touches the dev database.
- Experiments: E1 (lost update), E2 (isolation + deadlock), E3 (EXPLAIN, B-tree vs BRIN) in [EXPERIMENTS.md](../EXPERIMENTS.md).
- **`GET /events` (#4 / PR #9):** keyset cursor over `(occurred_at, id)` (the service reads one extra row to know whether another page follows), filters by `type` and time range, index `(occurred_at, id, type)`. The unfiltered first page on 1M rows went from a parallel sequential scan plus sort at 158 ms to an index scan at 0.3 ms (figures from the commit message). The 1M-row p95 and the deep-page numbers for the demo are not recorded here yet.
- **Precision change without downtime (expand / migrate / contract):** add a nullable `occurred_at_ms` (metadata-only), dual-write, backfill in throttled keyset batches (per-batch transactions, lock and statement timeouts, a pause while dead tuples exceed the autovacuum threshold; idempotent, safe to interrupt), then drop the old column and make the new one `NOT NULL`. The `down()` cannot bring microseconds back.
- **Migrations that cannot run in a transaction** (`CREATE INDEX CONCURRENTLY`) opt out per migration; a run holds a session-level advisory lock and a concurrent second run fails at once, because waiting would deadlock with `CONCURRENTLY`, which waits for every older transaction.
- **Seeding with production-shaped data** (`scripts/seed_events_prod.py`): `COPY` in one transaction with the `TRUNCATE` (a failed load leaves the table as it was), deterministic by seed, `ANALYZE` after the load. Rows go in `created_at` order, so `id` follows `created_at` while `occurred_at` is only roughly sorted, as in production; a strictly sorted seed flatters the cursor and BRIN. The type mix and payloads depend on the traffic group (about 91.6 / 7.8 / 0.66 percent page_view / purchase / error overall). See [DECISIONS.md](../DECISIONS.md).
- **Stale-list notice (#5, in progress):** the first page of `GET /events` returns a `pg_snapshot` taken in the same `REPEATABLE READ` read-only transaction; `GET /events/has-new` with the same filters asks whether a matching row is not visible in it. Needs `events.insert_xid bigint` holding the 64-bit transaction id (migration `0005`, two metadata-only steps, old rows `NULL`) and a BRIN index on it (`0006`); without the index each poll was a Parallel Seq Scan of 1M rows, 29-43 ms. See the decision log.
- Issues / PRs: #1 / PR #3; #4 / PR #9; #5 (open)

## Lessons from building it
- **Idempotency needs a key the client controls plus a constraint the database enforces.** A check in application code races: under READ COMMITTED both of two simultaneous requests see "not found". (#1, quiz.)
- **Conflicts are over rows and keys, not tables.** A common wrong model is "writes to one table queue up". Two inserts into `events` run in parallel; only the same `event_id` makes one wait. (Caught in the #1 quiz.)
- **Seeing MVCC in a real table** (`pageinspect`): tx 741 inserts `a` (`xmin=741`); tx 742 updates it to `b`, so slot 1 gets `xmax=742` and the new version sits in slot 2; while tx 743 had updated to `c` but not committed, a reader still saw `b` (`xmax=743` already on it) and did not wait; after `VACUUM` slots 1 and 2 were freed and only `c` remained.
- **`events` is append-only, so it makes almost no dead versions.** Bloat and vacuum become a real concern for counters and aggregates that are updated constantly (Stage 2 and later).
- **A reused `event_id` with a different body is dropped silently** (first wins). Cheap to change later; see the decision log.
- **`LIMIT` without a cursor is not paging.** `GET /events?limit=100` can only ever show the newest 100 rows; older events are unreachable. Real paging needs either `OFFSET` (cost grows with depth, and rows shift when new events arrive) or a keyset cursor on `(occurred_at, id)` (flat cost, stable under inserts, but no "jump to page N"). The ticket's "no skipped or duplicated rows while paging" criterion points at keyset. (#4 review.)
- **An `ORDER BY ... LIMIT` is only cheap if an index matches the order.** `events` has only the primary key and the `event_id` unique index, so newest-first over 1M rows is a sequential scan plus a sort. Check with `EXPLAIN (ANALYZE)` before and after adding an index on `(occurred_at DESC, id DESC)`; the filters on `type` may need their own composite. (#4 review; measure it, do not guess.)
- **Three ways to define "new" fail, and each failure was a concrete interleaving (#5).** `occurred_at > X` misses a late mobile event (old `occurred_at`). `id > last seen` or `created_at > last seen` misses a row whose transaction committed after a later one: tx 100 stays open, tx 101 commits and is seen, tx 100 commits. One encoded `insert_xid` has the same hole. A snapshot token does not, because `xip` lists the transactions that were in flight.
- **Reproduce the anomaly before designing for it.** Two psql sessions: A inserts without commit (xid 1705), B takes `pg_current_snapshot()` (`1705:1705:`), A commits, B runs `pg_visible_in_snapshot` on the row: `false`, although `SELECT` returns the row. The empty `xip` surprised: xid 1705 was not listed because it was at or above `xmax`, so it counts as "not started" for this snapshot.
- **A cast between a 32-bit and a 64-bit id is a delayed bug.** `xmin::text::xid8` passes every test now and breaks after the first wraparound. The fix cost a column; the alternative was a silent failure a year later.
- **A column with a volatile default is a table rewrite.** Splitting `ADD COLUMN` and `SET DEFAULT` made the migration instant on 1M rows.
- **The review looked at the plan, not only at the code.** `has-new` is correct (7 e2e tests, including the in-flight transaction) and still scans 1M rows per poll. Correct and cheap are separate checks.
- **BRIN beat B-tree here because the table is append-only.** On 1M rows: 24 kB against 6.7 MB, and about +25% on a bulk insert against about +130%; the query was under 0.1 ms with either. It works while the column follows the physical order (`pg_stats.correlation` near 1); after deletes or updates reuse old pages it slows down silently. `xid8` has no BRIN operator class, so the column is `bigint` holding the same 64-bit value.
