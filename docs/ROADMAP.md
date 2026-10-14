# Roadmap

Each stage is sized for 2-4 evenings. This file lists **topics and definitions of done only**. No implementation hints; day-to-day work arrives as GitHub Issues (`/next-ticket`).

Legend: **[N]** NestJS/TS, **[R]** React/TS, **[P]** Python, **[I]** infra/SQL.
"Prepares me for" points to the interview question (see [TOPICS_MAP.md](TOPICS_MAP.md)).

---

## Stage 1: Ingest + DB + simple event list
Goal: a working vertical slice. Events go in over HTTP, are stored, and can be listed.

- [ ] **Ingest endpoint** [N]
  - Topic: accepting events with validation.
  - Done when: invalid events are rejected with a clear error; valid events are persisted; the contract (event shape) is written down.
  - Prepares for: REST design, validation, API contracts.
- [ ] **Events storage** [N][I]
  - Topic: event schema and migrations in Postgres.
  - Done when: schema is versioned by migrations; a rerun on an empty DB reproduces it.
  - Prepares for: data modelling, migrations.
- [ ] **Event list API + simple UI** [N][R]
  - Topic: paginated listing with filters.
  - Done when: list is usable with 1M rows; pagination strategy is justified (offset vs keyset).
  - Prepares for: pagination trade-offs, slow queries.
- [ ] **Seed script** [P]
  - Topic: bulk-loading realistic data.
  - Done when: 1M events load in seconds, not minutes; the volume is configurable.
  - Prepares for: bulk load vs row-by-row inserts, `COPY`.
- [ ] **Event generator** [P]
  - Topic: synthetic load over HTTP with controllable rate and shape.
  - Done when: rate (events/s) and event mix are CLI parameters; runs for minutes without errors.
  - Prepares for: load generation, Python asyncio.
- [ ] **Module boundaries** [N]
  - Topic: modular monolith with ingest / processor / alert / gateway modules.
  - Done when: modules interact only via public interfaces; an abstract-class repository with Postgres and in-memory implementations is swappable in tests.
  - Prepares for: monolith vs microservices, abstract classes, DI.

## Stage 2: Kafka ingest + consumer group, batch writes, aggregates, concurrent updates
Goal: the event path becomes asynchronous and durable; aggregates stay correct under concurrency.

- [ ] **Kafka ingest path** [N]
  - Topic: ingest produces to a topic; a consumer group persists.
  - Done when: ingest latency no longer depends on DB speed; no events lost across a consumer restart.
  - Prepares for: Kafka vs RabbitMQ, delivery guarantees.
- [ ] **Batch writes** [N][I]
  - Topic: writing events in batches.
  - Done when: throughput gain over row-by-row is measured and recorded; batch size/latency trade-off is explained.
  - Prepares for: throughput vs latency, backpressure.
- [ ] **Idempotent consumer** [N][I]
  - Topic: duplicates after redelivery.
  - Done when: replaying the same offsets produces no duplicates and no changed totals.
  - Prepares for: at-least-once, idempotency.
- [ ] **Partitioning and ordering** [N]
  - Topic: key choice, partitions, parallelism.
  - Done when: per-key ordering is demonstrably preserved; the cost of the chosen key is explained.
  - Prepares for: ordering vs parallelism.
- [ ] **Aggregates (counters per type/window)** [N][I]
  - Topic: running counts and rollups.
  - Done when: totals stay exactly correct under N concurrent writers (verified by a script); the technique chosen is justified against alternatives.
  - Prepares for: lost update, isolation levels, locking.
- [ ] **Concurrency repro scripts** [P]
  - Topic: reproducing lost update and deadlock against the API/DB.
  - Done when: the bug reproduces reliably on demand and the fix is shown by the same script.
  - Prepares for: transactions, deadlocks.
- [ ] **Replay / rebuild** [N]
  - Topic: rebuilding aggregates from the log.
  - Done when: aggregates can be dropped and rebuilt from an earlier offset with identical results.
  - Prepares for: log vs queue, event sourcing basics.
- [ ] **Time partitioning and indexes** [I]
  - Topic: partitioned events table, B-tree vs BRIN vs partial.
  - Done when: query plans before/after are recorded; retention (dropping an old partition) works without a long lock.
  - Prepares for: diagnosing slow queries.

## Stage 2b (optional): RabbitMQ alert worker
Goal: background jobs with real delivery semantics.

- [ ] **Alert on threshold** [N]
  - Topic: aggregate crosses a threshold -> message -> alert worker.
  - Done when: alerts fire once per crossing, not once per event.
  - Prepares for: Kafka vs RabbitMQ, routing.
- [ ] **Exchanges and routing** [N]
  - Topic: multiple alert kinds routed to different queues.
  - Done when: adding a new alert kind needs no change to the publisher.
  - Prepares for: exchange types.
- [ ] **Retries and DLQ** [N][P]
  - Topic: transient vs permanent failures.
  - Done when: a poison message ends in a DLQ after bounded retries with backoff; healthy messages are never blocked; a Python script proves it.
  - Prepares for: ack/nack, DLQ, backpressure.

## Stage 3: Heavy frontend
Goal: a dashboard that stays smooth under volume.

- [ ] **Live stream to the browser** [N][R]
  - Topic: WebSocket or SSE push.
  - Done when: updates arrive without polling; reconnect after a drop resumes sensibly; the transport choice is justified.
  - Prepares for: WebSocket vs SSE vs polling.
- [ ] **100k-row table** [R]
  - Topic: virtualization.
  - Done when: scrolling stays at 60 FPS with 100k rows; before/after Profiler evidence recorded.
  - Prepares for: slow frontend diagnosis.
- [ ] **Live charts** [R]
  - Topic: high-frequency chart updates.
  - Done when: chart keeps up with the stream at the target rate without growing memory.
  - Prepares for: rendering cost, memory leaks in the browser.
- [ ] **Re-render control** [R]
  - Topic: avoiding wasted renders.
  - Done when: the Profiler shows only affected components re-render on a live update; each memoization is justified by a measurement.
  - Prepares for: React patterns, memoization.
- [ ] **React structure** [R]
  - Topic: hooks, composition, error boundary, lazy loading.
  - Done when: a failing widget does not take down the page; the stream logic is reusable and separated from presentation.
  - Prepares for: React patterns.

## Stage 4: Scaling, load testing, break and fix
Goal: find the limits, then move them.

- [ ] **2-3 instances behind nginx** [N][I]
  - Topic: horizontal scaling.
  - Done when: live updates reach clients regardless of which instance they hit; no in-memory state breaks correctness.
  - Prepares for: scaling, sticky sessions, pub/sub.
- [ ] **Metrics** [N]
  - Topic: RED/USE metrics, event loop lag, Kafka lag, DB timings.
  - Done when: one Grafana dashboard answers "is it slow, where, and since when".
  - Prepares for: diagnosing slow servers.
- [ ] **Load tests** [P]
  - Topic: Locust scenarios and result analysis.
  - Done when: max sustainable throughput is found and recorded with p50/p95/p99; the first bottleneck is named with evidence.
  - Prepares for: capacity thinking.
- [ ] **Break and fix rounds** [N][P]
  - Topic: leak, slow query, lag, lock contention (see [EXPERIMENTS.md](EXPERIMENTS.md)).
  - Done when: each is diagnosed from symptoms using tools, not guesses, and written up as a story.
  - Prepares for: all diagnosis questions.
- [ ] **Memory leak hunt** [N]
  - Topic: finding a leak with heap snapshots.
  - Done when: the leaking retainer is identified and the fix is verified by a flat heap over time.
  - Prepares for: GC and memory leaks.

## Stage 5 (optional): Microservices
Goal: feel the cost of distribution and learn the patterns that pay it.

- [ ] **Extract services** [N]
  - Topic: ingest, processor, alert, gateway as separate apps; schema per service.
  - Done when: each service starts and deploys alone; no cross-schema queries.
  - Prepares for: monolith vs microservices, database per service.
- [ ] **gRPC gateway -> processor** [N][P]
  - Topic: sync call with a typed contract.
  - Done when: gateway reads through gRPC; the contract is versioned; an optional Python client works.
  - Prepares for: REST vs gRPC.
- [ ] **Outbox pattern** [N][I]
  - Topic: atomic "write to DB and publish".
  - Done when: killing the process between commit and publish never loses an event.
  - Prepares for: distributed transactions, dual-write problem.
- [ ] **Resilience** [N]
  - Topic: timeouts, retries, circuit breaker, bulkhead.
  - Done when: killing processor-service degrades the gateway gracefully instead of cascading.
  - Prepares for: failure isolation.
- [ ] **Distributed tracing** [N]
  - Topic: one request across all services.
  - Done when: a single trace shows HTTP -> Kafka -> consumer -> RabbitMQ -> worker.
  - Prepares for: debugging across services.
- [ ] **Contract versioning** [N]
  - Topic: evolving event schemas.
  - Done when: an event change is rolled out with old and new consumers running side by side.
  - Prepares for: backward/forward compatibility.
- [ ] **Independent deploy** [I]
  - Topic: rolling restart of one service.
  - Done when: restarting one service causes no data loss and no user-visible outage.
  - Prepares for: deployment independence.
