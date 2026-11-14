# Decision log

Written by Claude after reviews and accepted tickets. See [HANDBOOK_GUIDE.md](HANDBOOK_GUIDE.md).

## Template

### YYYY-MM-DD: <decision title>
- **Issue / PR:** #N / #M
- **Decision:** <what was chosen>
- **Alternatives considered:** <option A (why not), option B (why not)>
- **Reasoning:** <why this one, in this context>
- **Reviewer feedback:**
  - BLOCKER: ...
  - SHOULD-FIX: ...
  - NIT: ...
- **What changed:** <what was done after the review>
- **Lesson:** <reusable takeaway>
- **Related chapter:** <link to docs/topics/...>

---

<!-- Entries go below, newest first. -->

### 2026-11-12: Production-shaped seed data derived from the client's numbers (work in progress)
- **Issue / PR:** none yet (branch `feat/seed-events-prod`, `scripts/seed_events_prod.py`).
- **Decision:** `occurred_at` is a mixture of three groups over a fixed 5-day window ending at `--end`: an even **baseline**, a normal-shaped **spike** (3.5 h, ending 45 min before the end) and a **ramp** in the last hour. The group shares are not guessed; they come from two equations built from the client's targets (35% of events in the last day, 4.5% in the last hour). `created_at = occurred_at + lag`; a value that falls outside the window is **redrawn, not clamped**. `--days` was dropped because the shares only hold for 5 days.
- **Alternatives considered:** one normal distribution over the window (no baseline, edges almost empty, the last hour is quiet); clamping to the window edge (a spike of equal timestamps on the boundary); dropping late events instead of redrawing the lag (truer lag distribution, but needs top-up batches to keep the row count); keeping `--days` (the shares silently stop matching the client's numbers for any other value).
- **Reasoning:** the planner, BRIN and the cursor behave differently on data shaped like production, so the shape is a requirement, not a detail. Deriving the shares from the targets keeps the data tied to what the business looks at (last day, last hour), and the measured result confirms it: 35.0% / 4.51% / spike 15.6% / peak 11x the baseline hour on 200k rows.
- **Reviewer feedback:**
  - BLOCKER (found by measuring): the first client numbers could not all hold. A 1.5 h spike of 18.75% of events gave a peak of 21x the baseline hour (asked: 8-10x) and the last hour held 0.7% (asked: 4-5%). They went back to the client, who kept the spike share, lengthened the spike and asked for a ramp in the last hour.
  - BLOCKER (fixed): with the wider spike, values landed after `end`; redrawing replaced a clamp.
  - SHOULD-FIX (fixed): a negative derived share silently gave its rows to the other groups; `derive_shares` now raises `ValueError`. `MIN_LAG` duplicated a literal in the lag buckets.
  - NIT (fixed): lag buckets as module constants, `BUCKETS` naming.
  - BLOCKER (found by CI and a hanging local run): `DATABASE_URL` was read at import, so the tests could not import the module without a database. It is now read by `database_url()` when a connection opens, with a clear message if it is missing. A module-level `assert` only moved the failure.
  - BLOCKER (found by a hanging test): after `lag = 0` was removed, a test that gave the redraw loop a room smaller than `MIN_LAG` could never finish; `while lag > room` redraws forever. The impossible cases were removed from the test.
- **What changed:** `derive_shares`, `draw_within_window`, `generate_distributed_occurred_at`, `generate_created_at`, event types and payloads shaped by group, `TRUNCATE` + `COPY` in one transaction and `ANALYZE` after it, one log line per step with timings and the group and type mix, pytest tests, a `pytest` step in CI. The old `seed_events.py` was removed: its `created_at` was "now" for every row and rows were sorted by `occurred_at`, which is the tidiness this script exists to avoid.
- **Lesson:** when a requirement is a shape, turn it into numbers you can measure, and measure the generated data against them before building on top. Two of the client's numbers contradicted each other, and only the measurement showed it. Redrawing the lag near the end makes those lags a little shorter than real ones; that is a known, cheap-to-reverse simplification.
- **Lesson (tests):** a loop that redraws until a condition holds needs a test for the case where the condition can never hold; it hangs instead of failing. Do not pipe a test run into `tail` and chain a commit after it: the pipe hides the exit code of the tests.
- **Related chapter:** [databases.md](topics/databases.md)

### 2026-11-03: MongoDB enters as alert-service storage (Stage 5) and a side benchmark, not in the monolith
- **Issue / PR:** none yet (planning discussion).
- **Decision:** add MongoDB in two places: (A) alert-service owns a MongoDB database for alert rules after the Stage 5 extraction; (C) experiment E19 benchmarks the same event workload on Postgres and MongoDB. Postgres stays the only store for events.
- **Alternatives considered:** Mongo now, next to Postgres, for the same events (dual-write with no consistency story, no problem Postgres cannot solve); a denormalized Mongo read model fed from Kafka (valid CQRS exercise, but overlaps with Redis cache and materialized views we already plan).
- **Reasoning:** the motivation is the job market, which is a valid learning goal, but each component must have a job it can defend. Nested, changing alert rules fit a document model, and schema per service makes a different engine natural. The benchmark gives measured evidence for "when which".
- **Reviewer feedback:**
  - BLOCKER (avoided): "add Mongo because vacancies ask for it" inside the monolith would create a dual-write problem and an interview story that works against the candidate.
- **What changed:** ROADMAP Stage 5 item, EXPERIMENTS E19, three TOPICS_MAP rows. docker-compose gets a `mongo` profile when the work starts.
- **Lesson:** a learning motive is fine; justify the component by the problem it solves where you place it, not by the motive.
- **Related chapter:** [technology-fit.md](topics/technology-fit.md)

### 2026-10-19: Deduplicate by a client-generated `event_id`, not by `order_id`
- **Issue / PR:** #1 / not opened yet. **Needs client confirmation: it changes the agreed contract.**
- **Decision:** every event carries a required `event_id` (UUID generated by the client once per event, reused on retries). The database enforces `UNIQUE (event_id)`; the first event wins (`201` new, `200` duplicate). `order_id` stays in the purchase payload as plain data with no index.
- **Alternatives considered:** the previous decision, a partial unique index on `order_id` for purchases only (leaves `page_view` and `error` with no way to detect a retry); `event_id` plus a unique `order_id` for purchases (double protection against a client that regenerates `event_id`, at the cost of a second type-specific constraint); a server-generated id (a retry would get a new id, so nothing is deduplicated).
- **Reasoning:** one mechanism for all event types, keyed on the thing that actually identifies a delivery. Retries from the network layer are the common case, and they reuse the same `event_id`.
- **Reviewer feedback:**
  - SHOULD-FIX (accepted risk): without a unique `order_id`, if two sources report the same purchase (for example the mobile app and the backend both emit `purchase` for one order), each event has its own `event_id` and revenue is double counted. A double tap or a retry is not this case: the payment itself is idempotent and a retry reuses the `event_id`. Safe only if the contract allows a single source to emit `purchase` (to confirm with the client). Cheap to reverse now; once duplicates are stored, adding the index needs a cleanup first.
  - Open: what happens when the same `event_id` arrives with a different body (currently: first wins, body not compared).
- **Client answer (2026-10-19):** `purchase` is sent by the backend only, after payment confirmation; a `purchase` from `web` or `mobile` must be rejected. This removes the double-reporting risk above, so no `order_id` index is needed. The client also requires that purchases are never lost, and that guest purchases can be linked to the checkout step; if a purchase cannot be linked it is still accepted, but the number of unlinked ones must be visible. **Open:** the link mechanism for guests (`device_id` passed through the order, a session id, or other) and its trade-offs.
- **Client answer, follow-up (2026-10-19):** about 10-15% of orders are placed outside the apps (by phone through an operator, from the internal admin panel; partners are not live yet). They are real revenue and must produce a `purchase`, with the order channel marked so channels can be told apart. They stay out of the "checkout -> paid" conversion (app funnel only), while revenue and order counts include everything. Guests are not anonymous: an email is collected and a guest customer record is created, so the backend has an id for the buyer; it must be distinguishable from a registered account, and a guest who later registers must not be counted as a new person. Matching a guest to earlier browsing is nice to have. **Consequence:** a missing `device_id` cannot be used to tell non-app orders apart (app orders can lack it too), so the channel needs its own field. **Decided by the developer:** (1) a required `channel` field in the purchase payload, a closed list (`app`, `phone`, `admin`; new channels are rare, so the cost of a schema change is acceptable; a new value must be deployed here before the backend sends it, otherwise the purchase is rejected and lost). (2) No guest/registered marker: the sender must keep `user_id` stable for a person, including when a guest registers; identity resolution is the sender's job, not this service's. Trade-off: the client said it wants to tell guest and registered ids apart, and this decision gives up that split inside Live Pulse (it cannot be backfilled inside Live Pulse later).
- **Client confirmation (2026-10-19):** "no split inside Live Pulse" is acceptable for ticket #1. Guest -> registered conversion is a weekly/monthly marketing number and may be answered from the shop's own customer database; the client must be told that Live Pulse relies on the shop for stable `user_id`s. A future report (revenue and unique buyers per day, split by guest vs registered) must stay possible: adding an optional field to the contract later is a safe extension, and old events can be classified by joining their `user_id` to the shop's customer data.
- **What changed:** contract updated (`event_id` field, duplicates paragraph, example); `order_id` no longer an idempotency key.
- **Lesson:** idempotency belongs to the delivery (one id per event), but a business invariant (one payment per order) is a separate constraint; dropping it is a conscious trade of safety for simplicity.
- **Related chapter:** [databases.md](topics/databases.md)

### 2026-10-16: Event model for ingest (issue #1 design review)
- **Issue / PR:** #1 / not opened yet. Written from the design discussion before implementation; update when the PR lands.
- **Decision:** One `events` table. Columns for what every event has or what is queried across types (`type`, `source`, `occurred_at`, `created_at`, `user_id`, `device_id`); everything type-specific lives in a `payload` jsonb, validated by a DTO per `type`. Full contract: [EVENT_CONTRACT.md](EVENT_CONTRACT.md).
- **Alternatives considered:** all identifiers inside `payload` (rejected: no type guarantee, slow `COUNT(DISTINCT payload->>...)`, expensive backfill later); one column per type-specific field (rejected: mostly NULL, grows with every new event type); a table per event type (not needed yet).
- **Reasoning:** the business metric "unique people" must be cheap and typed, so identifiers are columns. Adding a fourth event type must not rewrite intake, so type-specific data stays in `payload`. Rule of thumb: column if it is in (almost) every event or is aggregated across types; payload otherwise.
- **Reviewer feedback:**
  - SHOULD-FIX: identifiers first planned inside `payload`; moved to nullable columns.
  - SHOULD-FIX: `occurred_at` typed as DB-generated although the client sends it.
  - NIT: typo `occured_at` -> `occurred_at` (caught early; a column name leaks into every migration and query).
- **What changed:** columns made nullable where events can legitimately lack them; `occurred_at` is client-supplied with a required UTC offset and a 5-minute future tolerance (config, not hard-coded) because the timestamp comes from the device clock, not ours.
- **Lesson:** an "absent" value is modelled with a nullable column, not by hiding the field. Anything a client stamps (time, ids) is untrusted input.
- **Related chapter:** [databases.md](topics/databases.md)

### 2026-10-16: Idempotent purchases by `order_id`
- **Issue / PR:** #1 / not opened yet
- **Decision:** the first `purchase` for an `order_id` wins. A repeat is not stored and the client still gets success (`201` new, `200` duplicate). Uniqueness is meant to be enforced by the database with a partial unique index on `payload->>'order_id'` where `type = 'purchase'`.
- **Alternatives considered:** reject duplicates with `409` (retrying clients treat it as a failure); update the stored payload when a newer `occurred_at` arrives (retries arrive out of order and a purchase is a fact, so this adds complexity for no gain); a dedicated `order_id` column (valid, but NULL for most rows).
- **Reasoning:** clients retry and both client and server may report the same purchase, so without a key revenue is double counted. A check in application code has a race between two concurrent identical requests; only a DB constraint closes it.
- **Reviewer feedback:**
  - SHOULD-FIX: the first plan had no order identifier at all; `order_id` is now mandatory in `purchase`.
- **What changed:** `order_id` added to the purchase payload.
- **Lesson:** idempotency needs a key the client controls plus a constraint the database enforces. Known risk: in a partitioned table a unique index must include the partition key, so this has to be revisited at Stage 2.
- **Related chapter:** [databases.md](topics/databases.md)

### 2026-10-16: Page identity, funnel and unknown pages
- **Issue / PR:** #1 / not opened yet
- **Decision:** a page is identified by an agreed logical `page_id` (the same for web and mobile), not a raw URL or screen name; `entity_id` is required only for `category` and `item`. Unknown `page_id` values are accepted and stored. Funnel steps are counted as unique people per step, not as a sequence.
- **Alternatives considered:** raw URL normalised on the server (rules per platform, silent mistakes, breaks on redesign); rejecting unknown pages (loses events when a client ships a page before the vocabulary is updated); a stored `is_unknown` flag (goes stale when the vocabulary changes; derive it at query time instead).
- **Reasoning:** the business wants one number across platforms. A shortcut such as "add last item and go to checkout" produces `checkout` without `cart`, which breaks sequence-based funnels but not per-step unique counts.
- **Reviewer feedback:**
  - SHOULD-FIX: first plan stored `is_unknown`; replaced by a query-time comparison with the vocabulary.
  - NIT: `order` page value was ambiguous with `checkout` and `my-orders`; dropped (a purchase is already the `purchase` event).
- **What changed:** vocabulary is `home, catalog, category, item, cart, checkout, my-orders`.
- **Lesson:** do not store what can be derived from other fields; widening a contract is cheap, narrowing it is not.
- **Related chapter:** [api-styles.md](topics/api-styles.md)

### 2026-10-16: Error events are for analytics, not for debugging
- **Issue / PR:** #1 / not opened yet
- **Decision:** `error` payload is `operation` + `code` (closed vocabularies) + optional `page_id`. No free-text message, no stack trace. Clients always send `device_id`.
- **Alternatives considered:** free-text message (useless for grouping, may carry personal data, needs a size cap); server route templates as the location (change with refactors, and a request does not know the page); not collecting `device_id` for errors (cheap now, impossible to backfill if the business later asks why people did not pay).
- **Reasoning:** a dedicated error tracker owns debugging; this service answers "how many errors of which kind, where". Background jobs are included only when they directly affect a user.
- **Reviewer feedback:**
  - SHOULD-FIX: one `location` field mixed a page (clients) and a route (server); split into `operation` and `page_id`.
- **What changed:** see [EVENT_CONTRACT.md](EVENT_CONTRACT.md).
- **Lesson:** one field with two meanings depending on another field is a query trap; keep dimensions separate and low-cardinality.
- **Related chapter:** [scaling-and-diagnostics.md](topics/scaling-and-diagnostics.md)

### 2026-10-16: Product names are looked up, not stored in events
- **Issue / PR:** #1 (decision for later tickets)
- **Decision:** events carry item ids only; names are fetched from the catalog service and kept in a local copy so the dashboard still shows numbers when the catalog is down (id shown instead of name).
- **Alternatives considered:** names inside every event (bigger events, stale after a rename); ids only on the dashboard (poor UX).
- **Reasoning:** the business wants the current name and numbers even when the catalog is unavailable. A cache is volatile; a local table survives a restart.
- **Reviewer feedback:** none, design discussion only.
- **What changed:** nothing yet; implemented in a later dashboard ticket.
- **Lesson:** duplicating data buys independence and costs staleness; depending on the source buys freshness and costs availability. State the fallback behaviour up front.
- **Related chapter:** [microservices.md](topics/microservices.md)

### 2026-10-20: Same `event_id`, different body: first wins, silently
- **Issue / PR:** #1 / not opened yet
- **Decision:** a repeated `event_id` is ignored regardless of the body; the client gets `200`. Reusing an id for a different event is a client error and is not detected.
- **Alternatives considered:** `409 Conflict` on a different body (needs a read after the conflict or a stored body hash; honest to the client, but a retrying client treats it as failure); accept with `200` but count mismatches in a metric (visible, still cheap).
- **Reasoning:** the id is generated by the client once per event, so a mismatch means a client bug; the server's job is idempotency, not policing clients. Cheap to reverse: comparing bodies later needs no schema change if done by reading the existing row.
- **Reviewer feedback:**
  - SHOULD-FIX (accepted risk): the data loss is invisible to both sides. Documented in the contract; revisit with a conflict counter when metrics are added.
- **What changed:** Duplicates section of [EVENT_CONTRACT.md](EVENT_CONTRACT.md) states the rule explicitly.
- **Lesson:** ignoring bad input is a legitimate choice only if it is written down; otherwise it reads as an oversight.
- **Related chapter:** [databases.md](topics/databases.md)

### 2026-10-20: Length and size limits on event fields
- **Issue / PR:** #1 / not opened yet
- **Decision:** ids 128, `operation`/`code` 64, `referrer` 2048, `utm_*` 128, `items` 1..100, `quantity` 1..100000. Over-limit values are rejected naming the field, never truncated. `sum` and `unit_price` have no business cap, only the safe-integer range of `z.int()`.
- **Alternatives considered:** a business cap on `sum` (the client's stance is that revenue must never be dropped, so a legitimate large order would vanish); storing a "suspicious" flag at write time (needs a model change and migration, deferred to a dashboard ticket); `quantity` 1000 (proposed by the tech lead, the client said wholesale orders reach ~50000 units).
- **Reasoning:** structural limits protect storage and indexes from garbage at the cheapest place; business limits belong to the client and must not turn into lost revenue. Suspicious orders (e.g. `sum` over 10M UAH) are flagged at read time.
- **Reviewer feedback:**
  - SHOULD-FIX (corrected): the tech lead's first `quantity` limit of 1000 was a guess about the shop; the client showed it would reject real wholesale orders.
- **What changed:** limits in the event DTO, boundary tests, [EVENT_CONTRACT.md](EVENT_CONTRACT.md).
- **Lesson:** separate technical limits (the developer's call) from business limits (the client's call), and ask the owner before a guess becomes a rejection of revenue.
- **Related chapter:** [api-styles.md](topics/api-styles.md)

### 2026-10-20: Validation applied through a global pipe in `AppModule`
- **Issue / PR:** #1 / PR #3
- **Decision:** register `StandardSchemaValidationPipe` as `APP_PIPE` in `AppModule`.
- **Alternatives considered:** `app.useGlobalPipes(...)` in `main.ts` (tests built from `AppModule` would not get it); a shared `configureApp(app)` function (extra layer for one call; tried and removed as premature).
- **Reasoning:** the pipe becomes part of the DI graph, so the e2e tests and production run the same validation.
- **Reviewer feedback:**
  - BLOCKER: no pipe was registered at all; the schema was never applied and an invalid `type` reached Postgres (500). Found when a payload with a typo in `type` produced a database error.
- **What changed:** pipe registered; e2e tests assert `400` naming the field and that nothing is stored.
- **Lesson:** unit-testing a schema does not prove it is wired in; test through HTTP.
- **Related chapter:** [nestjs.md](topics/nestjs.md)

### 2026-10-20: e2e tests on a throwaway Postgres, files run one by one
- **Issue / PR:** #1 / PR #3
- **Decision:** `npm run test:e2e` starts a `postgres-test` container (compose profile `test`, tmpfs, own port), runs the migrations and removes the container; CI uses a service container instead (`E2E_EXTERNAL_DB=1`). e2e files do not run in parallel.
- **Alternatives considered:** reuse the dev database (a `TRUNCATE` in a test would wipe dev data); one database per worker (parallel, but more setup); Testcontainers library (new dependency).
- **Reasoning:** the dev data must never be touched, and all files share one database, so a `TRUNCATE` in one file would wipe another file's data mid-test. The container is removed if setup fails, so a failed run leaves no state behind.
- **Reviewer feedback:** none beyond the discussion.
- **What changed:** `docker-compose.yml` profile, `test/global-setup.ts`, `fileParallelism: false`, a CI Postgres service.
- **Lesson:** isolate test state from development state, and make a failed setup clean up after itself.
- **Related chapter:** [databases.md](topics/databases.md)

### 2026-10-20: Swagger examples and descriptions live in the Zod schema
- **Issue / PR:** #1 / PR #3
- **Decision:** examples and field descriptions are added with `.meta({ description, example })` on the schema fields; response codes are declared on the route with `@ApiCreatedResponse`, `@ApiOkResponse`, `@ApiBadRequestResponse`.
- **Alternatives considered:** a separate file of `@ApiBody({ examples })` (documentation drifts from the rules; the first attempt also failed typecheck because the decorator requires `schema` or `type`).
- **Reasoning:** the documentation sits next to the rule it describes. The `occurred_at` example is computed at startup because a fixed timestamp would be rejected as too old within 30 days.
- **Reviewer feedback:**
  - SHOULD-FIX (accepted): Swagger showed `MAX_SAFE_INTEGER` as the `occurred_at` example and no `200`/`400` responses, so "Try it out" with the default example failed.
- **What changed:** schema metadata, response decorators on `POST /events`.
- **Lesson:** generated documentation needs a read-through; defaults can be wrong.
- **Related chapter:** [api-styles.md](topics/api-styles.md)

### 2026-10-22: `GET /events` returns an explicit public shape, not the table row
- **Issue / PR:** #4 / PR #9
- **Decision:** the repository selects named columns (no internal `id`, no `created_at`); the response schema reuses the `POST` payload schemas (exported from `record-event.dto.ts`) and describes `occurred_at` as an ISO string and `user_id` / `device_id` as nullable. Order is `occurred_at desc, id desc`.
- **Alternatives considered:** `selectAll()` plus a schema that only documents the public fields (Swagger would lie, and clients could depend on `id`); a second copy of the payload schemas for the response (two places to change per new field).
- **Reasoning:** whatever a response returns becomes a contract. A field that leaks once is a breaking change to remove. One e2e test asserts the exact key set, because nothing else catches a return to `selectAll()`.
- **Reviewer feedback:**
  - BLOCKER (found while wiring): `limit` passed validation but the repository still had `.limit(10)`, so `?limit=100` returned 10 rows with no error. Typecheck and the old e2e test could not see it.
  - SHOULD-FIX (accepted): the e2e test expected `created_at` order while the code sorted by `occurred_at`; the owner decided on `occurred_at` and the test was rewritten.
  - SHOULD-FIX (resolved in PR #9): no paging beyond the newest `limit` rows (keyset cursor, 2026-11-03), no index for the sort and filters (index on `(occurred_at, id, type)`, 2026-10-27), no e2e test for the `type` and date filters (keyset paging and filters e2e).
- **What changed:** `limit` carried from query to SQL; explicit `select`; response schema in `list-events.response.dto.ts`; Swagger documents the response.
- **Lesson:** a value that is validated but never used fails silently. Follow one parameter from the query string to the SQL before calling it done, and pin the response shape with a test.
- **Related chapter:** [api-styles.md](topics/api-styles.md), [databases.md](topics/databases.md)

### 2026-10-27: Index `(occurred_at, id, type)` for the event list, built without blocking writes
- **Issue / PR:** #4 / PR #9
- **Decision:** one B-tree index matching the list order (`occurred_at DESC, id DESC`) with `type` as the last column, created with `CREATE INDEX CONCURRENTLY`. The migrate script lets a migration opt out of its transaction and takes a session-level advisory lock; a second concurrent run fails at once.
- **Alternatives considered:** `type` first (then the unfiltered first page cannot use the index); a partial index per type (several indexes for one query shape); a plain `CREATE INDEX` (blocks writes while it builds); waiting on the advisory lock (would deadlock with `CONCURRENTLY`, which waits for every older transaction).
- **Reasoning:** without it the unfiltered first page on 1M rows was a parallel sequential scan plus a sort, 158 ms; with it an index scan, 0.3 ms (figures from the commit message). `type` is last so the unfiltered query and `IN (...)` lists can still use the index.
- **Reviewer feedback:** the earlier review of #4 flagged the missing index as SHOULD-FIX.
- **What changed:** migration for the index, migrate script with per-migration transaction mode.
- **Lesson:** an `ORDER BY ... LIMIT` is cheap only if an index matches the order, and the column order of the index decides which queries can use it.
- **Related chapter:** [databases.md](topics/databases.md)

### 2026-11-03: Cursor from `(occurred_at, id)`, one extra row to know if a page follows
- **Issue / PR:** #4 / PR #9
- **Decision:** the repository filters by `(occurred_at, id)` below the cursor; the service reads one row past the page to learn whether another page exists and builds `nextCursor` from the last returned row.
- **Alternatives considered:** `OFFSET` (cost grows with depth, rows shift while new events arrive); a separate `count(*)` to detect the last page (a second query that is slow on 1M rows).
- **Reasoning:** keyset cost does not depend on depth, and a new event does not skip or repeat a row for a reader who is paging. Ties in `occurred_at` are broken by `id`; the seeding script keeps `occurred_at` at millisecond precision, so some values are equal and the tie-breaker is exercised.
- **Reviewer feedback:** none recorded beyond the review of #4 above.
- **What changed:** cursor codec, paginated response (`items`, `nextCursor`), repository and service.
- **Lesson:** keyset paging needs a total order; the tie-breaker is part of the cursor, not a detail.
- **Related chapter:** [databases.md](topics/databases.md), [api-styles.md](topics/api-styles.md)

### 2026-11-11: A 400 response has a described body; the client carries the HTTP status in its own error
- **Issue / PR:** #4 / PR #9
- **Decision:** `GET` and `POST /events` declare `BadRequestError` (`statusCode`, `error`, `message[]`) in the OpenAPI document; the client throws an `ApiError(status, body)` and decides retries from the status: no retry for 4xx except 408 and 429, retry 5xx and network failures up to 3 times.
- **Alternatives considered:** casting the thrown body to a type with `statusCode` in the client (the type is a claim, not a check; a network `TypeError` has no such field); a global `Register` type for all query errors (one type for every query); retrying everything (a bad request fails the same way each time).
- **Reasoning:** the client types are generated from the schema, so the schema has to tell the truth. The status taken from `response.status` exists for every outcome that has a response, whatever the body is.
- **Reviewer feedback:**
  - BLOCKER (found while wiring): `limit: 50000` in the web query; the server allows 1-100 and answered 400 to every request. The `retry` callback also returned the error object (always truthy), which means retry forever.
  - Tech lead's own error (admitted): "a 400 has no body", read from the schema; the server did send one. The schema had drifted from the behaviour.
  - SHOULD-FIX (accepted): `if (error)` treats a falsy empty body as success; the check is `error !== undefined`.
- **What changed:** `common/api-error.dto.ts`, regenerated `openapi.json` and `schema.d.ts`, `web/src/api/errors.ts` with tests.
- **Lesson:** when a type does not exist, find out why before adding it by hand; here the missing type was a sign that the contract was wrong. Verify what the reviewer claims from a schema against a real response.
- **Related chapter:** [api-styles.md](topics/api-styles.md), [typescript-react-patterns.md](topics/typescript-react-patterns.md)

### 2026-11-11: The event list never refetches by itself
- **Issue / PR:** #4 / PR #9 (groundwork for the change request #5)
- **Decision:** `refetchOnWindowFocus: false` and `refetchOnReconnect: false` on the list query only; the list changes when the reader asks.
- **Alternatives considered:** the same two options on the global `QueryClient` (right only if the whole app follows this rule, and later screens such as dashboards will want fresh data on return); leaving the default.
- **Reasoning:** with the default, returning to the tab reloads every loaded page and swaps them, so rows can shift under someone who is reading. #5 asks for exactly the opposite: a notice, and the reader chooses when to refresh.
- **Reviewer feedback:** SHOULD-FIX (accepted): the developer had decided "no automatic refetch", but nothing in the code said so; it was found when returning to a measurement tab triggered thousands of requests.
- **What changed:** two options and a comment in `useEventList`.
- **Lesson:** a decision that is only in the head is not implemented. Promote the option to a global default when a second query needs it.
- **Related chapter:** [typescript-react-patterns.md](topics/typescript-react-patterns.md)

### 2026-11-11: Row virtualization with TanStack Virtual, fixed columns, load-ahead of 40 rows
- **Issue / PR:** #4 / PR #9
- **Decision:** infinite scroll over a virtualized `<table>`: fixed row height 44 px, `overscan` 15, columns with fixed widths and truncation, the next page requested when the last visible row is within 40 of the end (pages of 100), at most one request at a time, a failed page stops the automatic loading and the button becomes a retry. The window logic lives in `useVirtualRows`, the component only draws.
- **Alternatives considered:** keep "Load more" without virtualization (cheapest, memory grows with every page); Prev / Next pages (bounded DOM, but the reader loses the place); `react-virtuoso` (less code, but it owns the markup and the scroll container, which makes the stable list needed by #5 harder); `react-window` (fixed-size lists, awkward with a `<table>`); `maxPages` (needs paging in both directions, and the cache turned out to be small).
- **Reasoning:** the owner put UX above implementation effort. Measured, one loaded row cost about 39 KB before and about 0.8 KB after (50k rows: about 1.93 GB to about 47 MB). `overscan` is one screen because that is how far a quick flick of the wheel goes; the prefetch distance sits between "visible plus overscan" (30) and one page (100), and 40 gives about three screens of margin at 44 px.
- **Reviewer feedback:**
  - SHOULD-FIX (accepted): `overscan` first tied to the page size; they are different numbers (rendering smoothness vs network prefetch).
  - BLOCKER (found while writing the trigger, not yet reproduced against a stopped server): a failed next-page fetch would make the screen replace the table with a full error and erase the list, and auto-loading would loop on a broken server. Both are handled in the code.
  - NIT (open): the row height exists twice (`ROW_HEIGHT` and the `h-11` class).
- **What changed:** `useVirtualRows.ts`, `EventTable.tsx`, `EventsPage.tsx`, `vite.config.ts` (a `VITE_API_BASE_URL` for tests, because CI has no `.env`).
- **Lesson:** measure before deciding what to optimize: the data in the cache (the part a cache window would cap) was about 2% of the per-row cost before virtualization; the DOM and components were the rest.
- **Related chapter:** [typescript-react-patterns.md](topics/typescript-react-patterns.md)
