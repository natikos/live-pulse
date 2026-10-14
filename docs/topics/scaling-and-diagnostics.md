# Scaling and diagnostics

My playbook for "how would you diagnose X" and "how would you scale Y". Meant to be retold out loud.

## The problem it solves
"It's slow" is a symptom, not a diagnosis. Without a method, people guess, change five things, and learn nothing. The method: **measure, locate the bottleneck, change one thing, measure again.** Scaling is the same discipline applied before the problem hits.

## Mental model

**Universal loop:** symptom -> metrics (where is the time?) -> narrow with the right tool -> hypothesis -> change one thing -> verify with the same metric.

**Metrics frameworks:**
- **RED** (for services): **R**ate, **E**rrors, **D**uration (use percentiles p50/p95/p99, not averages).
- **USE** (for resources): **U**tilization, **S**aturation, **E**rrors (CPU, memory, disk, connections, pools).

**Little's law** for capacity: concurrent requests in flight = arrival rate x latency. If latency doubles at the same rate, concurrency doubles and pools/queues fill: that is how a slow dependency becomes an outage.

```
User --> nginx --> app instances --> Postgres / Kafka / Redis
 latency?   queue?    CPU? loop lag?     slow queries? locks? lag? cache misses?
```

## Trade-offs and when to choose what

| Scale by | Helps | Limits |
|----------|-------|--------|
| Optimize first (query, index, batch) | cheapest, biggest wins | finite |
| Vertical (bigger machine) | no code change | ceiling, single point of failure |
| Horizontal app instances | stateless CPU/IO capacity | needs shared state (Redis), DB becomes the bottleneck |
| Cache | read-heavy, tolerant of staleness | invalidation, stampedes, extra moving part |
| Read replicas | read scale | replication lag |
| Partitioning / sharding | huge data/write volume | complexity, cross-partition queries |
| Async (queue/stream) | absorb bursts, decouple | eventual consistency |

Rule: find the **first bottleneck**; fixing anything else changes nothing.

## Failure modes and how to reason about them

### Slow query
1. Confirm it is the query (DB metrics, slow query log / `pg_stat_statements`).
2. `EXPLAIN (ANALYZE, BUFFERS)`: seq scan on a big table? rows estimated vs actual far apart? sort/hash spilling? many buffers read?
3. Fix: index matching the predicate, query rewrite, fresh statistics, partition pruning, fewer rows/columns, batching.
4. Check locks too: the query may be *waiting*, not running (blocked by another transaction).
5. Re-run the plan; compare numbers.

### Slow server
1. RED: is latency up for all endpoints or one? Errors? Rate change?
2. USE: CPU pegged? memory growing? connection pool saturated?
3. Node-specific: **event loop lag**, GC time, heap trend.
4. CPU profile / flame graph for hot code; heap snapshots for leaks.
5. Downstream: DB, broker, external calls (tracing shows which span is slow).
6. Load test to reproduce; find the knee where latency explodes.

### Slow frontend
1. Which slow: initial load, interaction, scroll, or update stream?
2. Network tab: payload size, request count, waterfall.
3. React Profiler: what re-rendered, why, how long.
4. Chrome Performance: long tasks, layout/paint, scripting.
5. Memory tab for growth over time.
6. Fix: virtualize, batch updates, memoize measured hot spots, split bundle, reduce payload.

### Growing consumer lag
1. Is it rising, or is it a spike that recovers? Per partition?
2. Compare produce rate vs consume rate.
3. Where does a batch spend time: deserialization, processing, DB write? (DB is the usual culprit.)
4. Skew: one hot partition/key?
5. Rebalance storms (consumers flapping)?
6. Fix: batch size, faster sink, more consumers (<= partitions), more partitions (plan ordering), shed or sample load.

### Slow request across services
1. Get a **trace id**; open the trace.
2. Find the widest span / the gap with no span (queueing, network, missing instrumentation).
3. Check that service's RED and USE metrics for that time window.
4. Check async hops: lag on the topic/queue between spans.
5. Look for retry amplification and timeouts stacking (inner timeout > outer timeout).

## Key details that matter
- **Percentiles, not averages.** Averages hide the tail; p99 is what some users feel all the time under fan-out.
- **Coordinated omission:** a load generator that waits for slow responses before sending more under-reports latency; use open-model load (fixed arrival rate).
- **Stateless instances:** anything per-instance (memory cache, local WebSocket connections, local timers/jobs) breaks with N instances; use Redis pub/sub for fan-out, shared cache, and leader election or a queue for jobs.
- **WebSocket at scale:** connections are sticky to an instance; to push to a user connected elsewhere you need pub/sub between instances. Sticky sessions help the handshake/long-polling fallbacks, not fan-out.
- **Connection pools:** DB connections are scarce; N instances x pool size must stay below DB limits (use a pooler if needed).
- **Capacity thinking:** state target (events/s, p99, concurrent users), measure per-instance capacity, find the first bottleneck, compute instances needed with headroom (e.g. 30-40%), and name what breaks next.
- **Back-of-the-envelope:** e.g. 5k events/s x 500 B = 2.5 MB/s; 86 400 s/day -> ~430M events/day, ~215 GB/day raw at that size: drives partitioning and retention decisions.

## In 30 seconds
"I never guess: I measure first. For a slow request I look at RED metrics to see where latency is, then drill with the right tool: EXPLAIN for the DB, CPU profile and event-loop lag for Node, Profiler for React, consumer lag for Kafka, a trace across services. I change one thing and re-measure. For scaling I find the first bottleneck, usually the database, and fix that: index or batch first, then caching or more instances, with shared state in Redis so instances stay stateless."

**Follow-ups:**
- *Where do you start?* Metrics: is it everywhere or one endpoint, and since when (deploy? load?).
- *Why p99?* Averages hide tail latency, and a page making many calls hits the tail often.
- *How would you scale this 100x?* Measure the per-instance limit, find the bottleneck (DB writes, partitions, fan-out), then batch/partition/shard/cache and add instances.
- *Adding instances didn't help?* The bottleneck is elsewhere (DB, a lock, a hot partition).
- *Difference between lag spike and growing lag?* A spike recovers when capacity > rate; growing lag means consume rate < produce rate.

## In Live Pulse
_Stub. Claude fills as the project progresses._
- Stage 4 is dedicated to this chapter: instances behind nginx, Grafana dashboards, Locust, break and fix rounds.
- Experiments: E3, E7, E9, E11, E12, E15 in [EXPERIMENTS.md](../EXPERIMENTS.md).
- Issues / PRs: _(none yet)_

## Lessons from building it
_Stub. Real findings go here._
