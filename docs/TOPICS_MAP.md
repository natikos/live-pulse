# Topics map

Question people ask -> what I do in the project -> where it lives.
"Handbook" = chapter in `docs/topics/`. "Exp" = entry in [EXPERIMENTS.md](EXPERIMENTS.md). "Stage" = [ROADMAP.md](ROADMAP.md).

| Question | What I do in the project | Where |
|----------|--------------------------|-------|
| What are transactions and isolation levels? | Run concurrent writers under READ COMMITTED vs SERIALIZABLE; see which anomalies each prevents | [databases](topics/databases.md); Exp: read committed vs serializable; Stage 2 |
| Two concurrent UPDATEs: what happens? (lost update) | Reproduce a lost update on a counter with a Python script, fix it 3 ways | [databases](topics/databases.md); Exp: lost update; `scripts/concurrency/` |
| What is a deadlock and how do you avoid it? | Provoke one with opposite lock order, read the Postgres log, fix with consistent ordering | [databases](topics/databases.md); Exp: deadlock |
| DI scopes in NestJS (singleton / request / transient)? | Compare the three scopes, measure the cost of request scope | [nestjs](topics/nestjs.md); Exp: provider scopes |
| How does the garbage collector work? What is a memory leak in Node? | Plant a leak, find it with `--inspect` and heap snapshots | [nodejs-runtime](topics/nodejs-runtime.md); Exp: memory leak; Stage 4 |
| How do you scale an application? | Run 2-3 instances behind nginx, find what breaks (state, WebSocket), fix with Redis pub/sub | [scaling-and-diagnostics](topics/scaling-and-diagnostics.md); Exp: 2+ instances; Stage 4 |
| How do you diagnose a slow query? | `EXPLAIN (ANALYZE, BUFFERS)` before/after index, B-tree vs BRIN, partition pruning | [databases](topics/databases.md), [scaling-and-diagnostics](topics/scaling-and-diagnostics.md); Exp: EXPLAIN |
| How do you diagnose a slow server? | Metrics (RED/USE), event loop lag, CPU profile, load test to the first bottleneck | [scaling-and-diagnostics](topics/scaling-and-diagnostics.md), [nodejs-runtime](topics/nodejs-runtime.md); Stage 4 |
| How do you diagnose a slow frontend? | React Profiler, Chrome Performance tab; 100k rows with and without virtualization | [typescript-react-patterns](topics/typescript-react-patterns.md), [scaling-and-diagnostics](topics/scaling-and-diagnostics.md); Exp: 100k rows; Stage 3 |
| Which technology for which job? When NOT to use it? (Redis vs Postgres, Kafka vs queue, ...) | Give each tool one job; run Redis restart and cold-cache experiments; justify every new component | [technology-fit](topics/technology-fit.md), [messaging](topics/messaging.md), [databases](topics/databases.md); Stage 1-5 |
| Kafka vs RabbitMQ: when which? | Use Kafka for the event stream and RabbitMQ for alerts in the same system | [messaging](topics/messaging.md); Stage 2, 2b |
| Delivery guarantees and idempotency? | Kill a consumer mid-batch, observe redelivery, make writes idempotent | [messaging](topics/messaging.md); Exp: kill consumer |
| How do you handle duplicates and ordering? | `event_id` unique + `ON CONFLICT DO NOTHING`; partition key choice; add partitions and watch ordering | [messaging](topics/messaging.md); Exp: partitions, kill consumer |
| Consumer lag: what is it and how do you react? | Generate load faster than the consumer, watch lag in Grafana, scale consumers | [messaging](topics/messaging.md), [scaling-and-diagnostics](topics/scaling-and-diagnostics.md); Exp: consumer lag |
| Poison messages and dead-letter queues? | Publish a poison message from Python, watch retries with backoff, land in DLQ | [messaging](topics/messaging.md); Exp: poison message; Stage 2b |
| Monolith vs microservices? | Build a modular monolith first, extract in Stage 5, compare costs | [microservices](topics/microservices.md); Stage 1, 5 |
| How do services communicate? | Async via Kafka/RabbitMQ, sync via gRPC gateway -> processor | [microservices](topics/microservices.md), [api-styles](topics/api-styles.md); Stage 5 |
| Distributed transactions, outbox, saga? | Lose a message between commit and publish, fix with outbox | [microservices](topics/microservices.md); Exp: outbox |
| How do you debug a request across services? | Trace one request through all services in Jaeger | [microservices](topics/microservices.md), [scaling-and-diagnostics](topics/scaling-and-diagnostics.md); Exp: tracing |
| What happens when a dependency is down? | Kill processor-service, see cascading failure, add timeout + circuit breaker | [microservices](topics/microservices.md); Exp: cascading failure |
| REST vs GraphQL vs RPC? | REST for the public API, gRPC between services, compare latency/payload | [api-styles](topics/api-styles.md); Stage 5 |
| `type` vs `interface` in TypeScript? | Use each deliberately in DTOs, events and contracts; review decisions | [typescript-react-patterns](topics/typescript-react-patterns.md) |
| Abstract class vs interface? | `EventRepository` abstract class as DI token, Postgres + in-memory implementations | [typescript-react-patterns](topics/typescript-react-patterns.md), [nestjs](topics/nestjs.md); Stage 1 |
| Which React patterns do you use and why? | Custom hook `useEventStream`, composition, context + reducer, error boundary, lazy | [typescript-react-patterns](topics/typescript-react-patterns.md); Stage 3 |
| How do you evolve an event schema safely? | Change a schema, watch consumers break, apply backward-compatible rules | [microservices](topics/microservices.md); Exp: schema change |
| How do you deploy without downtime? | Rolling restart of one service while the rest keep working | [microservices](topics/microservices.md); Exp: rolling restart |
