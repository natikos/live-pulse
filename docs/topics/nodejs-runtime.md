# Node.js runtime

Covers: event loop, garbage collector, memory leaks, heap snapshots, profiling.

## The problem it solves
Node handles thousands of connections with one JavaScript thread. That is efficient for I/O-bound work and fragile for anything that blocks the thread or quietly retains memory. Understanding the runtime lets you explain "the server got slow / died after 6 hours" instead of guessing.

## Mental model

```
 incoming I/O ──> [ event loop: timers -> pending -> poll(I/O) -> check -> close ]
                          │ runs ONE JS callback at a time
                          ▼
              JS thread  ── delegates ──> libuv thread pool (fs, dns, crypto, zlib)
                                          OS async I/O (sockets)
```

- One thread runs your JS. While one callback runs, **nothing else runs**. A 200 ms synchronous loop means every request waits 200 ms.
- `await` doesn't block the thread; it yields back to the loop.
- Microtasks (promises, `process.nextTick`) run before the loop moves on; a runaway microtask chain starves I/O.

**Garbage collection (V8):** objects are freed when **unreachable** from roots (globals, stack, active closures). Generational:
- *Young generation (new space):* most objects die young; cheap, frequent scavenges.
- *Old generation:* survivors get promoted; collected by less frequent, more expensive mark-and-sweep/compact (largely incremental and concurrent, but still costs).

**Memory leak in a GC language = unintended reachability.** The collector is not broken; something still points at the data.

## Trade-offs and when to choose what

| Problem | Option | Trade-off |
|---------|--------|-----------|
| CPU-heavy work blocks the loop | `worker_threads` | shared nothing, messaging cost; good for compute |
| | separate process / service | isolation, more ops |
| | chunk the work (yield between chunks) | simple, still on the main thread |
| Scale across cores | `cluster` / multiple instances behind a balancer | state must be external (Redis/DB) |
| Heap too small for the workload | raise heap limit | hides leaks, longer GC pauses |
| Cache in memory | bounded LRU with TTL | stale data and per-instance divergence vs speed |

## Failure modes and how to reason about them
- **Event loop blocked:** symptom is high latency for *all* endpoints at once, low CPU wait on I/O, one core at 100%. Measure **event loop lag** (e.g. `perf_hooks` histogram); profile CPU to find the sync hot spot (JSON.stringify of a huge object, regex backtracking, sync crypto, big loops).
- **Memory leak:** symptom is heap growing monotonically **after full GCs**, rising GC time, eventually OOM or restart loops. A sawtooth that returns to the same baseline is healthy.
- **Typical leak sources:** unbounded caches/Maps keyed by id, event listeners added per request and never removed, closures retaining large objects, timers never cleared, per-connection state not cleaned on disconnect (WebSocket!), accumulating arrays of in-flight promises.
- **Backpressure ignored:** producing faster than the consumer drains, so buffers grow in memory (streams, WebSocket send buffers, unbounded queues).
- **Diagnosis order:** metrics (is it CPU, memory, loop lag, or downstream?) -> narrow with the right profiler -> reproduce under load -> fix -> verify with the same measurement.

## Key details that matter
- **Heap snapshot** = full object graph at a moment. Take two (before/after load) and **compare**: growing constructors, then follow the **retainer path** to the root that keeps them alive. Snapshots pause the process, so take them off the production hot path.
- **Allocation sampling / timeline** shows *where* objects are allocated; snapshots show *what retains* them.
- **CPU profile** (flame graph) shows where time goes; wide bars at the top = hot functions. Event-loop-blocking code shows as long sync stacks.
- `--inspect` attaches Chrome DevTools to a running Node for heap/CPU profiling.
- `heapUsed` vs `rss`: RSS includes native memory and buffers outside the V8 heap; `Buffer`/native leaks don't show in the JS heap.
- Never block in the request path: no `*Sync` fs calls, no big sync loops, no sync crypto on hot routes.

## In 30 seconds
"Node runs JS on one thread driven by an event loop, so anything synchronous and slow delays every request; I watch event loop lag and move CPU work to worker threads or another process. The GC frees what is unreachable, so a leak means something still holds a reference: unbounded caches, listeners, closures, per-connection state. To find one I look for a heap that grows after full GCs, take two heap snapshots under load, diff them and follow the retainer path to the root. For slowness I start with metrics, then a CPU profile."

**Follow-ups:**
- *How do you scale Node across cores?* Multiple processes/instances; keep state external.
- *Why is a sawtooth heap fine?* GC reclaims; baseline stays flat.
- *Does `await` block?* No; it yields to the event loop.
- *Server freezes for everyone briefly, what first?* Event loop lag metric, then a CPU profile; also check GC pauses.
- *Where would you NOT use Node?* Heavy CPU-bound compute without offloading.

## In Live Pulse
_Stub. Claude fills as the project progresses._
- Experiments: E9 (memory leak), E10 (provider scopes, stateful singleton) in [EXPERIMENTS.md](../EXPERIMENTS.md).
- Issues / PRs: _(none yet)_

## Lessons from building it
_Stub. Real findings go here._
