# Technology fit: what each tool is for, and when NOT to use it

Covers: the "right tool for the job" question for every technology in the stack (databases, brokers, runtime, frontend, infra, observability, tooling). Deep dives live in the other chapters; this one is the map and the "do not use it for X" list.

## The problem it solves
Most bad architectures are not caused by a bad tool but by a **good tool used for the wrong job**: Redis as the system of record, Kafka as a task queue, microservices for a 3-person team. In an interview, "when would you NOT use it?" separates people who know a tool from people who have only used it.

## Mental model
Every tool is optimized for one **access pattern** and pays for it somewhere else. Pick by the question: *what is the data, who reads it, how fast, and what happens if it is lost?*

```
Is it the source of truth, must survive a crash, needs queries/transactions?  -> Postgres
Is it derived/temporary, fast to rebuild, needs sub-ms access?               -> Redis
Is it an ordered stream of facts, high volume, replayable, many readers?     -> Kafka
Is it a work item that must be done once with retry/DLQ/routing?             -> RabbitMQ
Is it a push of live updates to a browser?                                   -> WebSocket / SSE (+ Redis pub/sub to fan out)
```

Rule of thumb: **one source of truth (Postgres); everything else is a cache, a pipe, or a view of it.**

### Remember it with an analogy: a bank branch and a newspaper

| Tool | Analogy | Real-world example | The "wrong tool" picture |
|------|---------|--------------------|--------------------------|
| **Postgres** | The **bank vault + ledger**. Slow to enter, but every coin is recorded, audited, and survives a fire | Orders, payments, user accounts: "did the customer pay?" must still be true tomorrow | Keeping the money in the cashier's pocket (Redis) |
| **Redis** | The **cashier's desk / sticky notes**. Instant to reach, but if the desk is cleared you lose the notes (you can re-copy them from the ledger) | Product page cache; "max 100 requests/min per user" counters; who is online right now | Keeping the only copy of the customer's balance on a sticky note |
| **Kafka** | A **newspaper archive / CCTV tape**. Events are appended in order and kept; anyone can start reading from any day, and reading does not remove anything | Clickstream, bank transaction feed, IoT sensors: analytics, fraud detection and search indexing each read the *same* stream at their own pace | Using the archive to hand out one task per clerk. There is no "take this one, mark it done, send the failed ones back" |
| **RabbitMQ** | A **post office / restaurant order tickets**. A ticket goes to one cook, who confirms it is done; if the cook faints, the ticket goes to another; undeliverable mail goes to the "returned" shelf (DLQ) | "Send confirmation email", "resize this image", "notify on-call about the alert" | Using it as the archive: once the cook finishes, the ticket is thrown away, so a new employee cannot read last week's orders |
| **Redis pub/sub** | A **radio broadcast**. Only people tuned in right now hear it; no recording | "Your teammate just joined the document" pushed to every open browser | Relying on the radio for the payment confirmation: if the app was off for a second, it never knows |
| **WebSocket / SSE** | A **phone call / live ticker**. The line stays open so the server can speak first, instead of you calling every 2 seconds ("are we there yet?") | Live dashboards, chat, stock prices, delivery tracking | Opening a permanent line for a page that changes once a day |
| **nginx** | The **receptionist** sending each visitor to a free desk | Spreading traffic over 3 app instances | Assuming the visitor's folder is on the desk they used last time (local state) |
| **Microservices** | **Separate companies** instead of **departments of one company**. Independent, but now they send letters, can lose them, and need contracts | Amazon-scale teams shipping independently | Splitting a 3-person startup into 3 companies |
| **Partitioning (Postgres)** | Filing **one cabinet per month** instead of one giant pile; throwing away 2022 = removing a cabinet | Logs and events with retention | Using monthly cabinets for a 500-document archive |
| **BRIN index** | A **book's chapter index by page range**: "March is on pages 200-240". Tiny, works only because the book is in date order | Append-only event tables sorted by time | Using it on a shuffled book: every chapter "might" contain March |
| **Materialized view** | A **printed daily report**. Fast to read, but stale until reprinted | "Events per hour for the last 30 days" | A printed report for "how many seats are free right now" |
| **Virtualization (TanStack Virtual)** | A **shop window**: you display what a passer-by can see, not the entire warehouse | Table with 100k rows | Windowing a 20-item list. Pure overhead |
| **Prometheus vs Jaeger** | **Car dashboard vs black-box recorder**. The dashboard says *the engine is hot*; the recorder shows *what happened on this one trip* | Metrics: "p99 is 800 ms". Trace: "this request spent 700 ms in the DB call" | Asking the dashboard which exact trip failed |

### Same domain, three tools: one worked example (online shop)
A customer places an order:
1. **Postgres:** `INSERT order` inside a transaction. This is the fact; it must never be lost.
2. **Kafka:** publish `OrderPlaced`. Analytics, the warehouse system, and the recommendation engine each read it independently, and a new "fraud" consumer added next month can replay history from day one.
3. **RabbitMQ:** "send confirmation email" is a task for exactly one worker. If the mail server is down, retry with backoff; after 5 failures it goes to the DLQ for a human.
4. **Redis:** the product page shows "only 3 left" from a cache, and the rate limiter counts clicks per second. If Redis is wiped, everything is rebuilt from Postgres.
5. **WebSocket:** the order status page updates live ("packed", "shipped"), with Redis pub/sub carrying the message to whichever app instance holds the user's connection.

Lose Redis: slower for a minute. Lose RabbitMQ's acked mail: nobody cares. Lose Postgres: the shop is gone. That ordering of "how bad is it?" is exactly why Postgres is the source of truth.

### A war story to remember: "Redis as the database"
A team stores user balances only in Redis because it is fast. Redis restarts after a deploy; with default snapshotting (RDB) the last minutes of writes are not on disk. Users find their last top-ups missing, and nobody has a ledger to rebuild from. The fix is a durable source of truth (Postgres) with Redis as a cache in front. The lesson: **speed is not durability.** (Illustrative scenario of a well-known failure class, not a Live Pulse incident. Replace it with our own experiment once we run "Redis restart".)

## Trade-offs and when to choose what

| Tool | Use it for | Do NOT use it for | Why not (concrete failure) |
|------|-----------|-------------------|----------------------------|
| **PostgreSQL** | Source of truth; relational data; transactions; ad-hoc queries; time-series at moderate scale (partitioning + BRIN) | A message queue at high rate; a cache for hot keys; full-text search at large scale; unbounded blob storage | Polling a `jobs` table burns connections and locks (`SKIP LOCKED` helps, but throughput caps early); hot-key reads compete with writes for the same buffers; big blobs bloat tables and backups |
| **Redis** | Cache; rate limits; counters; sessions; pub/sub fan-out; short-lived locks; leaderboards | Primary store of business data; anything you cannot rebuild; large datasets (RAM is the limit); reliable messaging | Persistence is best-effort (RDB snapshot / AOF fsync policy): a crash or failover can **lose the last seconds of writes**. Pub/sub is fire-and-forget: a subscriber that is down misses the message forever. No joins, weak querying, memory cost |
| **Kafka** | High-volume event stream; event history and **replay**; many independent consumer groups; ordering per key | Per-message retry/DLQ/delay/priority; low-volume simple jobs; request/reply; being your query database | No built-in per-message retry: one poison message blocks its partition. Operating a cluster is heavy for 50 msg/s. You cannot query "event X" cheaply, only scan |
| **RabbitMQ** | Background jobs; alerts; flexible routing; retries with backoff; DLQ; priorities; delays | Long retention and replay; very high-throughput streams; being the event history | Consumed message is gone, no replay. Throughput and ordering degrade with competing consumers and requeues. Huge backlogs hurt the broker |
| **WebSocket / SSE** | Server -> browser live updates (SSE if one-way is enough; WebSocket if bidirectional) | Request/response APIs; anything where polling every few seconds is good enough; guaranteed delivery | Connections are stateful: breaks naive horizontal scaling, needs sticky sessions or a shared fan-out layer; a reconnect loses messages unless you add resume (last-event-id / offsets) |
| **REST** | Public APIs; simple CRUD; cacheable reads | High-frequency internal service calls; streaming | Chatty JSON over HTTP/1.1 costs latency and CPU between services |
| **gRPC** | Internal sync calls with a typed contract; streaming between services | Public browser-facing APIs (needs a proxy); the first thing you build | Tooling and debugging friction; strict schema discipline needed; no benefit inside one process |
| **GraphQL** | Many clients with different data needs | One client, simple resources; hot paths needing predictable cost | Query cost is unbounded unless limited; N+1 and caching are your problem |
| **NestJS / Node** | I/O-bound APIs, workers, consumers, gateways | CPU-heavy work on the main thread (image/video, big JSON transforms, crypto loops) | One blocked event loop stalls **every** request; use worker threads or another service/language for CPU work |
| **React (+ virtualization)** | Interactive UIs with lots of state | Rendering 100k DOM rows directly | The browser lays out every node: FPS collapses, memory balloons; virtualize or paginate |
| **Prometheus + Grafana** | Metrics, trends, alerting (RED/USE) | Per-request debugging; high-cardinality labels (user id, event id) | Cardinality explosion kills Prometheus memory; metrics tell you *that* something is slow, not *which request* |
| **Jaeger / tracing** | Following one request across services | Aggregate trends; always-on 100% sampling at scale | Overhead and storage; sample instead |
| **Microservices** | Independent deploy/scale/ownership when a monolith's seams already hurt | Small team, unclear domain boundaries, "for cleanliness" | Network failure, distributed transactions, and debugging cost replace function calls. Start as a modular monolith |
| **Python (scripts)** | Data generation, analysis, load tests, one-off tooling | The production request path | A second runtime to build, deploy, secure, and observe for no gain |
| **nginx (load balancer)** | Spreading traffic over N stateless instances; TLS termination; static files | Fixing a slow instance; carrying state between requests | Round-robin sends a WebSocket reconnect or a session to a different instance; if state is local, the user sees it vanish. Also a single point of failure unless duplicated |
| **Docker Compose** | Local dev and experiments; reproducible environments | Production orchestration at scale; HA and rolling deploys | Single host, no self-healing or scheduling; "works in compose" says nothing about failover behavior |
| **TanStack Virtual** | Long lists/tables (100k rows) where only the visible window is rendered | Short lists; content that needs native find-in-page or variable, unmeasurable heights | Extra complexity and scroll-jump bugs for no gain on 50 rows |
| **uPlot / ECharts** | uPlot: fast, lightweight time-series with many points. ECharts: rich chart types, interactions | ECharts for hundreds of thousands of live points (heavier); uPlot for complex interactive dashboards (you build more yourself) | Wrong pick = dropped frames or weeks of custom code. Downsample on the server before drawing millions of points |
| **OpenTelemetry (SDK)** | Vendor-neutral traces/metrics instrumentation | Replacing a metrics backend; 100% sampling in hot paths | It is an instrumentation standard, not storage or a UI; overhead and cost grow with sampling |
| **Locust (Python)** | Load tests with realistic user scenarios; finding the first bottleneck | Micro-benchmarks of a function; testing from the same machine as the app | A load generator on the same host steals CPU from the system under test, so numbers are wrong. Python workers cap request rate per core |
| **matplotlib (analysis)** | Offline charts of experiment results | Live dashboards | Static images, no interactivity or live data |

### Inside Postgres: features and when NOT to use them

| Feature | Use it for | Do NOT use it for | Why not |
|---------|-----------|-------------------|---------|
| **Partitioning (by time)** | Huge append-mostly tables; cheap retention (`DROP` old partition); partition pruning | Small tables (< tens of millions of rows); queries that do not filter by the partition key | Planning overhead, more objects to manage, no pruning means scanning every partition |
| **B-tree index** | Equality and range on selective columns; ordering; uniqueness | Low-selectivity columns; write-heavy tables with many indexes | Every index slows inserts and takes space; planner may ignore it |
| **BRIN index** | Huge, naturally ordered data (timestamps in an append-only table); tiny size | Randomly ordered data; point lookups | Data not correlated with physical order makes BRIN nearly useless (scans most blocks) |
| **Partial index** | A small, hot subset (`WHERE status = 'open'`) | Queries that do not repeat the predicate | Planner can use it only if the query provably matches the predicate |
| **Materialized view** | Expensive aggregates that tolerate staleness | Data that must be real-time; frequent refresh of huge views | Refresh recomputes (or locks without `CONCURRENTLY`); users see stale data between refreshes |
| **`COPY` / bulk insert** | Seeding and batch loads | Single-row transactional writes needing per-row error handling | One bad row fails the whole COPY |
| **`SERIALIZABLE` isolation** | Invariants across rows that races could break | Default for everything | Aborts with serialization failures; you must retry; lower throughput |
| **`LISTEN/NOTIFY`** | Light signalling between a few processes | Reliable messaging or high volume | Payload is small, no persistence: a disconnected listener misses it |

### Inside the brokers: details people get wrong
- **Kafka partitions:** more partitions mean more parallelism, but also a partial loss of ordering when the key choice is wrong, and rebalance cost. Do not pick the count "just in case" at 1000.
- **Kafka (KRaft) single node:** fine for learning; no durability or availability story. Production needs replication factor >= 3.
- **RabbitMQ queues:** unbounded backlog grows memory/disk pressure; set limits and a DLQ. Do not use it as long-term storage.
- **Redis pub/sub vs Streams:** pub/sub loses messages for absent subscribers; Streams add persistence and consumer groups but are not a Kafka replacement at scale.

### The anti-patterns, by name
- **Redis as the database.** Fast, so it feels like a database. But a restart without durable persistence, an eviction policy under memory pressure, or a failover to a stale replica silently drops data. Use it for what you can recompute from Postgres.
- **Postgres as a high-rate queue.** Fine at tens of jobs/sec with `FOR UPDATE SKIP LOCKED`; wrong at thousands/sec or with fan-out to many consumers.
- **Kafka as a task queue.** You will re-invent retry, DLQ, and delay on top of a log.
- **RabbitMQ as an event store.** Once acked, history is gone, so no replay and no new consumer can catch up.
- **Everything is a microservice.** You pay the network and consistency cost before you have the scaling problem.
- **A cache as a fix for a missing index.** Measure the query first (`EXPLAIN`), cache second.

## Failure modes and how to reason about them
Ask for each component: **"if it loses all its data right now, what do we lose?"**

| Component dies and restarts empty | Consequence | Acceptable? |
|----------------------------------|-------------|-------------|
| Redis cache | Cache misses, DB load spike (cache stampede) | Yes, if the DB can survive the spike |
| Redis pub/sub | Live updates missed during the gap | Yes, if clients can re-fetch on reconnect |
| Kafka topic (replicated, retained) | Consumers resume from the committed offset | Yes, that is the design |
| RabbitMQ durable queue | Unacked messages are redelivered; acked ones are done | Yes, with idempotent consumers |
| Postgres | The business is gone without backups | **No**: this is why it is the source of truth |

Reasoning checklist when choosing a store:
1. **Durability:** can I rebuild this data? If not, it belongs in Postgres.
2. **Access pattern:** point lookup, range scan, full scan, join, or stream?
3. **Volume and growth:** does it fit in RAM (Redis) or need disk and partitioning (Postgres/Kafka)?
4. **Consistency:** do I need a transaction across two writes? Then both must live in one store (or use an outbox).
5. **Operations:** who will run, monitor, and upgrade it? Every new component is a new failure mode and an on-call burden.

## Key details that matter
- **Cache is an optimization, not a dependency.** If the system is wrong or down without the cache, it is not a cache, it is a database with bad durability.
- **Dual writes are unsafe.** Writing to Postgres and publishing to a broker in two steps can lose the message between them. Fix with the **outbox** pattern (see [microservices](microservices.md)).
- **Pub/sub is not a queue.** No storage, no ack, no replay. Use it for live fan-out only; use a queue/log when loss is not OK.
- **Redis eviction and persistence are configuration, not guarantees.** "Redis persists to disk" does not mean "no data loss"; it means "bounded loss window".
- **Throughput is not the only axis.** Kafka wins on throughput and replay; RabbitMQ wins on per-message control. Choose by the message's *semantics* (fact vs task), not by speed alone. Details: [messaging](messaging.md).
- **Add a component only when a measured problem demands it.** Postgres alone carries a surprising amount of load; see [scaling-and-diagnostics](scaling-and-diagnostics.md).

## In 30 seconds
"I pick a tool by its access pattern and by what happens if it loses data. Postgres is the source of truth: transactions, queries, durability. Redis is for derived, fast, rebuildable data: cache, rate limits, pub/sub fan-out. Kafka is a replayable log for high-volume facts. RabbitMQ is for tasks that need retry, routing, and a DLQ. The key trade-off is that every specialized tool is fast at one thing by giving up something else: Redis gives up durability and queries, Kafka gives up per-message control, RabbitMQ gives up replay. A classic failure is using Redis as the primary database: after a restart or failover you silently lose the last writes. I would not add Kafka or microservices until a measured problem needs them."

Typical follow-ups:
- **Why not store everything in Redis if it is faster?** RAM is expensive and limited, persistence is best-effort, there is no rich querying, and a failover can lose recent writes. Fine for a cache, wrong for the source of truth.
- **Why not use Postgres as the queue?** Works at low rates with `SKIP LOCKED`. At high rates, polling and lock contention hurt the same database that serves your reads and writes, and there is no fan-out or replay.
- **Redis pub/sub or Kafka for live dashboard updates?** Pub/sub for transient browser fan-out (loss is tolerable, clients re-sync). Kafka for the durable stream that feeds Postgres.
- **When is a cache the wrong fix?** When the query is slow because of a missing index or bad plan. Fix the root cause, then cache if still needed.
- **How do you decide to add a new component?** Show the measured problem it solves, name the new failure modes it introduces, and confirm the team can operate it.

## In Live Pulse
Each tool has one job, so no tool is doing another's work:

| Tool | Role here | Not used for |
|------|-----------|--------------|
| Postgres | Events and aggregates (source of truth) | Queue, cache |
| Kafka | Main event stream -> batch writer to Postgres | Alerts/jobs |
| RabbitMQ | Alerts and background jobs (retry, DLQ) | Event history |
| Redis | Cache + pub/sub so WebSocket/SSE fan-out works across instances | Any data that cannot be rebuilt from Postgres |

- No BullMQ: RabbitMQ already covers the job-queue role (one tool per job).
- Modular monolith until Stage 5: see [microservices](microservices.md).
- Python stays in `scripts/` and never in a production path.
- (Stub) Link experiments and tickets here as they are built, e.g. Redis restart with and without persistence, 2+ instances without Redis pub/sub.

## Lessons from building it
_(Stub. Fill from real tickets, reviews and experiments. Candidate stories: what breaks with 2+ instances and local WebSocket state; what a Redis restart does to the cache and to pub/sub subscribers; what happens to the DB when the cache is cold.)_
