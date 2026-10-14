# Microservices

Covers: monolith vs modular monolith vs microservices, sync vs async communication, database per service, API gateway, outbox, saga, resilience patterns, idempotency, eventual consistency, distributed tracing, contract versioning, and why NOT microservices here.

## The problem it solves
As a codebase and team grow, a single deployable becomes hard to change independently, scale selectively and isolate failures. Microservices trade **simplicity** for **independent deployability, scaling and fault isolation**. The key question is never "are microservices modern?" but "is the organisational/scale pain bigger than the cost of distribution?"

## Mental model

```
Monolith          Modular monolith             Microservices
[ everything ]    [ A | B | C ] one process     [A]--net-->[B]--net-->[C]
one deploy        strict module boundaries     separate deploy, data, scaling
one DB            one DB (schemas per module)  DB per service
function calls    function calls               network calls (can fail, be slow)
```

The step that costs the most is turning a **function call into a network call**: it can time out, fail halfway, duplicate, reorder. Everything below is the toolbox for living with that.

## Trade-offs and when to choose what

| | Monolith | Modular monolith | Microservices |
|---|---|---|---|
| Complexity | lowest | low | high (infra, tracing, contracts) |
| Deploy independence | none | none | full |
| Scale parts separately | no | no | yes |
| Transactions across features | trivial | trivial | hard (outbox/saga) |
| Team autonomy | low | medium | high |
| Failure isolation | none | none | possible, but you must build it |

Choose microservices when: multiple teams block each other, parts have very different scaling/availability needs, or different tech/lifecycles are required. Otherwise **modular monolith first**: same boundaries, none of the distribution tax, and extraction stays possible.

**Communication:**

| Style | Use for | Cost |
|-------|---------|------|
| Sync (REST/gRPC) | queries needing an immediate answer | temporal coupling; failures cascade |
| Async (events/messages) | state changes, notifications, long work | eventual consistency; harder to trace/debug |

Prefer async for propagating facts, sync for reads that need an answer now.

**Data:** database (or schema) per service; no cross-service joins or shared tables. Share data via events or APIs. Cost: duplicated data, eventual consistency, no cross-service ACID transaction.

## Failure modes and how to reason about them
- **Cascading failure:** service A waits on dead B, its threads/connections fill, A dies, then everyone upstream. Defenses:
  - **Timeout** on every remote call (budget smaller than the caller's own timeout).
  - **Retry** only idempotent calls, with backoff + jitter, with a cap (retries multiply load: retry storm).
  - **Circuit breaker:** after repeated failures, fail fast (open), probe occasionally (half-open), close on success.
  - **Bulkhead:** separate pools per dependency so one slow dependency can't eat all capacity.
  - **Fallback/degrade:** cached or partial result.
- **Dual write:** "write DB, then publish" is two systems, no shared transaction; a crash between them loses or diverges. **Outbox pattern:** write the event to an outbox table in the *same* DB transaction as the data; a relay publishes it afterward (at-least-once, so consumers are idempotent). Alternative: CDC on the DB log. 2PC is avoided because it blocks and couples availability.
- **Distributed transaction across services:** use a **saga**: a sequence of local transactions, each with a **compensating action** on failure. Orchestrated (central coordinator) or choreographed (events). Accept intermediate states are visible (eventual consistency).
- **Duplicates and reordering:** at-least-once delivery means idempotent consumers (idempotency key) and tolerance to out-of-order events (version/sequence numbers).
- **Schema change breaks consumers:** see contracts below.
- **Debugging "it's slow/failing somewhere":** without correlation, each service's logs are islands. Use **distributed tracing**: a trace id propagated via HTTP headers and message headers; each hop is a span; find the slow/failed span.
- **Distributed monolith (worst outcome):** services that must deploy together, share a DB, or call each other synchronously in long chains. You get all the cost and none of the benefit.

## Key details that matter
- **Eventual consistency:** after a write, other services/read models converge after a delay. Design UX and invariants around it (read-your-writes where needed).
- **Contract versioning:** additive changes (new optional field) are backward compatible; renaming/removing/changing meaning is breaking. Roll out with expand/contract: deploy consumers that tolerate both, then change producers, then remove the old. Use explicit schema versions for events.
- **Idempotency key** on commands/events lets retries and redeliveries be safe.
- **API gateway:** single entry point for auth, routing, rate limiting, aggregation; risk of becoming a bottleneck/god-service.
- **Service discovery:** here Docker DNS (service name -> container); in orchestrators the platform provides it.
- **Independent deploy needs:** graceful shutdown, readiness checks, backward-compatible contracts, and async buffering so a restarting service doesn't drop work.
- **Observability budget:** per-service metrics, structured logs with trace ids, tracing; required, not optional.

## In 30 seconds
"Microservices buy independent deployment, scaling and failure isolation, and charge for it with network failure modes, eventual consistency and operational overhead. I start with a modular monolith with strict module boundaries, and extract a service only when a concrete pain justifies it. Across services I use async events for state propagation and sync calls only where I need an answer now, protected by timeouts, retries with backoff, and circuit breakers. For 'write DB and publish' I use the outbox pattern so a crash can't lose the event, and I make consumers idempotent."

**Follow-ups:**
- *Why not microservices for this app?* One developer, one team, shared data model, no divergent scaling need; the distribution cost has no payoff. It is done in Stage 5 only to learn the costs.
- *How do you do a transaction across services?* Avoid it by design; otherwise saga with compensations.
- *What if the downstream is down?* Timeout, bounded retry, breaker, fallback; async where possible to buffer.
- *How do you find which service is slow?* Distributed trace; look at span durations.
- *How do you change an event safely?* Additive, versioned; expand then contract.
- *Sync chain of 5 services?* Availability multiplies (0.99^5), latency adds; flatten or make async.

## In Live Pulse
_Stub. Claude fills as the project progresses._
- Stages 1-4: modular monolith with ingest / processor / alert / gateway modules. Stage 5 extracts them.
- Experiments: E13-E17 in [EXPERIMENTS.md](../EXPERIMENTS.md).
- Issues / PRs: _(none yet)_

## Lessons from building it
_Stub. Real findings go here._
