# API styles: REST, GraphQL, gRPC/tRPC

## The problem it solves
Clients and servers need a contract for exchanging data. The style determines how flexible queries are, how efficient the wire is, how easily the contract evolves, and how much tooling you get. There is no best style, only fit for the client, the network and the team.

## Mental model

| | REST | GraphQL | gRPC | tRPC |
|---|---|---|---|---|
| Shape | resources + HTTP verbs | one endpoint, client-specified query | typed RPC methods, protobuf | typed functions shared via TypeScript types |
| Transport | HTTP/1.1+ JSON | HTTP, JSON | HTTP/2, binary | HTTP, JSON |
| Contract | OpenAPI (optional) | schema (required) | `.proto` (required) | TS types (no separate schema) |
| Streaming | SSE/WebSocket separately | subscriptions | built-in (server, client, bidi) | limited |
| Browser | native | native | needs gRPC-web proxy | native |

## Trade-offs and when to choose what

| Style | Choose when | Costs |
|-------|-------------|-------|
| REST | public/simple APIs, caching via HTTP, broad tooling, CRUD-like resources | over/under-fetching; many round trips for rich views; versioning by convention |
| GraphQL | many different clients with different data needs, deep nested views, one aggregation layer over several backends | caching harder; N+1 resolver problem (DataLoader); query-cost/depth limiting needed; more server complexity |
| gRPC | internal service-to-service, low latency, streaming, strict typed contracts, polyglot | not browser-native; binary hard to debug by eye; needs proto toolchain |
| tRPC | full-stack TypeScript monorepo, one team owns both sides | couples client to server types; not for public or polyglot consumers |

Rule of thumb: **REST at the edge, gRPC between services, GraphQL when client-driven querying is the actual problem.** "Because it's modern" is not a reason.

## Failure modes and how to reason about them
- **Over-fetching/under-fetching (REST):** payloads too big or too many calls; fix with sparse fields, composite endpoints, or GraphQL where justified.
- **N+1 in GraphQL:** each nested field triggers a query; batch with DataLoader.
- **Expensive queries (GraphQL):** a client can request a huge nested graph; enforce depth/complexity limits and persisted queries.
- **Breaking changes:** REST: version the path or evolve additively; GraphQL: deprecate fields; gRPC/protobuf: never reuse field numbers, only add optional fields.
- **Sync chain latency:** every hop adds latency and failure probability; set deadlines/timeouts, propagate them.
- **Pagination:** offset gets slow and unstable on large, changing data; keyset (cursor) pagination is stable and fast. Applies to every style.
- **Idempotency:** retries need idempotent methods or idempotency keys, regardless of style.

## Key details that matter
- REST semantics: `GET` safe and idempotent; `PUT`/`DELETE` idempotent; `POST` not. Status codes carry meaning (4xx client, 5xx server).
- Protobuf wire is compact and schema-bound: smaller than JSON, fast to parse, but fields are identified by number, not name.
- HTTP/2 multiplexes many calls on one connection, removing head-of-line blocking at the HTTP level.
- Real-time to browsers is a separate decision: SSE (one-way, simple, auto-reconnect, works over plain HTTP) vs WebSocket (bidirectional, more infrastructure) vs polling.

## In 30 seconds
"I use REST at the public edge because it is simple, cacheable and universally supported, gRPC between services where I want a strict typed contract, low latency and streaming, and I'd reach for GraphQL only when many clients need different shapes of the same data. The costs I weigh are cacheability, tooling, browser support and contract evolution, not fashion."

**Follow-ups:**
- *Why not GraphQL here?* One frontend, known screens; REST endpoints serve it fine and caching/ops stay simple.
- *Why is gRPC faster?* Binary protobuf payloads and HTTP/2 multiplexing; the gain matters at high call volume or large payloads.
- *How do you version a REST API?* Prefer additive changes; version the path only for breaking ones.
- *tRPC vs REST?* tRPC removes the contract layer when one TS team owns both ends; it fails for external consumers.
- *Offset vs cursor pagination?* Cursor: stable and constant cost; offset degrades with depth and shifts under writes.

## In Live Pulse
_Stub. Claude fills as the project progresses._
- Stages 1-4: REST between frontend and backend. Stage 5: gRPC becomes the real sync transport between gateway and processor.
- Optional experiment: E18 (gRPC vs REST on latency and payload size) in [EXPERIMENTS.md](../EXPERIMENTS.md).
- Issues / PRs: _(none yet)_

## Lessons from building it
_Stub. Real findings go here._
