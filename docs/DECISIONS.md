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
