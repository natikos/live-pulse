# Experiments: break and fix

Each experiment: **hypothesis -> reproduce -> observe -> fix -> I should be able to explain**.
Record results (numbers, plans, screenshots) in the linked issue/PR; Claude turns the interesting ones into [STUDY_NOTES](STUDY_NOTES.md) stories.
Status: `[ ]` not done, `[x]` done. Language: **[P]** Python script, **[N]** NestJS, **[R]** React, **[I]** infra/SQL.

---

## Databases

### E1. Lost update on a counter (Stage 2) [P][N][I]
- [ ] **Hypothesis:** N concurrent "read, add 1, write back" updates lose increments.
- **Reproduce:** A Python script fires many concurrent requests that increment one counter via a naive read-then-write path. Compare the final value with the number of requests.
- **Observe:** Final value is lower than expected; the gap grows with concurrency. Look at the interleaving of the two transactions.
- **Fix, three ways:** (1) atomic `UPDATE x = x + 1`; (2) `SELECT ... FOR UPDATE`; (3) optimistic locking with a `version` column and retry.
- **Compare:** correctness, throughput, behaviour under contention (waiting vs retrying), when each is the right tool.
- **I should explain:** why READ COMMITTED allows it, why the atomic update is usually best, what pessimistic vs optimistic means, when optimistic locking wins (low contention, long user think-time).

### E2. Read committed vs serializable, and a deadlock (Stage 2) [P][I]
- [ ] **Hypothesis:** SERIALIZABLE prevents anomalies READ COMMITTED allows, at the price of aborts you must retry.
- **Reproduce:** Run the same two-transaction scenario (e.g. check-then-insert on an aggregate, write skew) under both levels. Then provoke a deadlock: two transactions locking two rows in opposite order.
- **Observe:** Under SERIALIZABLE one transaction fails with a serialization error. The deadlock is detected by Postgres and one transaction is killed; read the server log.
- **Fix:** retry loop for serialization failures; consistent lock ordering for deadlocks.
- **I should explain:** what each isolation level prevents, why retries are mandatory at SERIALIZABLE, how deadlocks form, how to prevent them (ordering, short transactions).

### E3. EXPLAIN before and after an index; B-tree vs BRIN (Stage 2) [P][I]
- [ ] **Hypothesis:** an index turns a sequential scan into an index scan with orders of magnitude fewer buffers; BRIN is tiny and good for naturally ordered time columns.
- **Reproduce:** seed millions of rows with the Python script. Run `EXPLAIN (ANALYZE, BUFFERS)` on a time-range and a filtered query. Add a B-tree, re-run. Replace with BRIN, re-run. Try a partial index for a hot subset.
- **Observe:** plan node type, rows removed by filter, buffers hit/read, execution time, index size.
- **Fix:** pick the index per query pattern; check partition pruning once partitioned.
- **I should explain:** how to read a plan, why BRIN depends on physical ordering, index size vs speed vs write cost, why an index may be ignored.

## Messaging

### E4. Kill a consumer mid-batch (Stage 2) [N][P][I]
- [ ] **Hypothesis:** killing a consumer after the DB write but before the offset commit causes duplicate processing after rebalance.
- **Reproduce:** run the consumer group with 2 consumers, produce steadily, kill one while a batch is in flight.
- **Observe:** rebalance, partitions reassigned, some events processed twice (duplicate rows or double-counted aggregates).
- **Fix:** idempotent writes: unique `event_id` + `ON CONFLICT DO NOTHING`; aggregates updated in the same transaction as the insert, only for rows actually inserted.
- **I should explain:** at-least-once, why exactly-once end to end needs idempotency, what a rebalance is, offset commit ordering.

### E5. Add partitions: ordering vs parallelism (Stage 2) [N][P]
- [ ] **Hypothesis:** more partitions give more parallel consumers but only per-key ordering.
- **Reproduce:** produce keyed events with sequence numbers; consume with 1, then 3 consumers; add partitions to the topic.
- **Observe:** order within a key is preserved; order across keys is not; adding partitions changes the key -> partition mapping, so ordering for an existing key can break across the change.
- **I should explain:** what the partition key must be, why the consumer count is capped by partitions, why you plan partition count up front.

### E6. Replay from an earlier offset (Stage 2) [N]
- [ ] **Hypothesis:** because Kafka retains the log, aggregates can be rebuilt by resetting offsets.
- **Reproduce:** drop aggregates, consume again from an earlier offset with a new group or reset.
- **Observe:** the rebuilt aggregates equal the originals only if processing is idempotent and deterministic.
- **I should explain:** log vs queue, retention as a design parameter, what makes replay safe.

### E7. Consumer lag under load (Stage 2/4) [P][I]
- [ ] **Hypothesis:** when producers outrun the consumer group, lag grows without bound until the consumer or the DB is scaled.
- **Reproduce:** generator at a rate above consumer capacity; watch lag in Grafana.
- **Observe:** lag per partition, throughput plateau, where the time goes (DB batch insert, deserialization, CPU).
- **Fix:** batch size, more consumers (up to the partition count), faster writes.
- **I should explain:** lag as the key health metric, backpressure, why adding consumers beyond partitions does nothing.

### E8. RabbitMQ poison message, retries, DLQ (Stage 2b) [N][P]
- [ ] **Hypothesis:** a message that always fails will block or loop forever without bounded retries and a DLQ.
- **Reproduce:** Python publishes a poison message among healthy ones.
- **Observe:** requeue loop with immediate `nack(requeue)`; then retries with backoff; finally the message in the DLQ while healthy messages flow.
- **I should explain:** transient vs permanent failures, ack/nack semantics, why backoff, how to inspect and replay a DLQ.

## Runtime and framework

### E9. Intentional memory leak (Stage 4) [N]
- [ ] **Hypothesis:** an unbounded cache or listener accumulation grows the heap until the process gets slow or OOM-killed.
- **Reproduce:** plant a leak (growing Map / unremoved listeners), run under load, watch heap and GC time.
- **Observe:** heap grows monotonically after full GCs; take snapshots at two points, compare, find the retainer path.
- **Fix:** bound the cache / remove listeners; verify a flat heap.
- **I should explain:** generational GC at a high level, what "leak" means in a GC language (unintended reachability), snapshot diffing, `--inspect`.

### E10. Provider scopes and performance (Stage 1/4) [N]
- [ ] **Hypothesis:** request-scoped providers cost an instance per request and bubble up the dependency chain.
- **Reproduce:** the same service as singleton, request, transient; benchmark.
- **Observe:** latency/allocations, and which other providers silently became request-scoped.
- **I should explain:** when request scope is justified, scope bubbling, the stateful-singleton bug (shared mutable state across requests).

## Frontend

### E11. 100k rows with and without virtualization (Stage 3) [R]
- [ ] **Hypothesis:** rendering all rows kills the main thread; virtualization renders only what is visible.
- **Reproduce:** render 100k rows naively, then with TanStack Virtual. Record in React Profiler and the Chrome Performance tab.
- **Observe:** commit time, DOM node count, scroll FPS, memory.
- **I should explain:** why DOM size is the cost, how windowing works, what virtualization breaks (find-in-page, variable heights).

## Scaling

### E12. What breaks with 2+ instances (Stage 4) [N][I]
- [ ] **Hypothesis:** in-memory state and local WebSocket connections break correctness behind a load balancer.
- **Reproduce:** run 2-3 instances behind nginx; connect clients to different instances; push an event handled by instance A.
- **Observe:** clients on B never get it; in-memory caches diverge; WebSocket reconnect lands on another instance.
- **Fix:** Redis pub/sub for fan-out, shared cache, no per-instance state; sticky sessions only where truly needed.
- **I should explain:** stateless services, why pub/sub is the fan-out mechanism, sticky sessions vs shared state.

## Microservices (Stage 5)

### E13. Kill processor-service: cascading failure [N][P]
- [ ] **Hypothesis:** without timeouts the gateway hangs on a dead dependency and exhausts its own resources.
- **Reproduce:** kill processor-service under load; watch gateway latency and errors.
- **Fix:** timeout, then circuit breaker with a fallback.
- **I should explain:** cascading failure, timeout budgets, breaker states, bulkheads.

### E14. Lose a message between commit and publish [N][I]
- [ ] **Hypothesis:** writing to the DB and publishing to Kafka are two operations; a crash between them loses an event.
- **Reproduce:** inject a crash after commit, before publish.
- **Fix:** outbox table written in the same transaction + a relay publishing it (at-least-once, so consumers stay idempotent).
- **I should explain:** the dual-write problem, why 2PC is avoided, outbox trade-offs.

### E15. Trace one request across all services [N]
- [ ] **Hypothesis:** with propagated trace context, one trace shows the whole path, including async hops.
- **Reproduce:** send a request, find it in Jaeger.
- **Observe:** spans across HTTP, Kafka, RabbitMQ; where time is spent; where context is lost if not propagated.
- **I should explain:** trace vs span, context propagation through message headers.

### E16. Change an event schema [N]
- [ ] **Hypothesis:** a breaking change in a producer breaks old consumers.
- **Reproduce:** rename/remove a field; run old consumers.
- **Fix:** backward-compatible rules (additive fields, defaults, versioning); deploy consumers first.
- **I should explain:** backward vs forward compatibility, expand/contract.

### E17. Rolling restart of one service [I]
- [ ] **Hypothesis:** with graceful shutdown and async buffering, one service can restart without stopping the others.
- **Reproduce:** restart each service in turn under load.
- **Observe:** in-flight requests, consumer rebalances, lag spike and recovery.
- **I should explain:** graceful shutdown, readiness vs liveness, why async messaging absorbs restarts.

## Optional

### E18. gRPC vs REST: latency and payload size (Stage 5) [N][P]
- [ ] **Hypothesis:** gRPC (protobuf, HTTP/2) is smaller and faster than JSON over REST for the same call.
- **Reproduce:** same query served both ways; measure payload bytes and latency at several concurrency levels.
- **I should explain:** where the gain comes from, when it does not matter, the cost (tooling, browser support, debuggability).
