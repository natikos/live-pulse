# Ticket #1: remaining work before the PR

Branch: `feat/1-ingest-events-http`. Acceptance criteria are in the issue (`gh issue view 1`).
Contract: `docs/EVENT_CONTRACT.md`. Decisions and open questions: `docs/DECISIONS.md`.

## Done

- [x] Event contract written and agreed (`docs/EVENT_CONTRACT.md`), updated after the client clarification round
- [x] Zod validation for `page_view`, `purchase`, `error` (`record-event.dto.ts` + unit tests); `user_id` / `device_id` capped at 128 chars
- [x] `EventsModule` imported in `AppModule`
- [x] `.env` loaded in `config.ts` via `dotenv`; debug `console.log(process.env)` removed
- [x] Migration `0001_create_events` written with the Kysely schema builder
- [x] Migration scripts: `npm run migrate` and `npm run migrate:down` (`scripts/migrate.ts`)

## Contract changes to implement (agreed in the clarification round)

- [x] `event_id`: required UUID in the envelope (`z.uuid()`), column `event_id uuid NOT NULL UNIQUE` in `0001`
- [x] `purchase` is accepted only with `source = "server"`; other sources are rejected with a message naming `source`
- [x] `purchase.payload.channel`: required, closed list `app` | `phone` | `admin`
- [x] `device_id` is optional for `purchase` (server source); check the `device_id` rule in `superRefine` still behaves
- [x] `occurred_at` more than 5 minutes ahead of the server clock is rejected (`MAX_CLOCK_SKEW_MS`); also older than 30 days (`MAX_EVENT_AGE_MS`), both configuration
- [x] `order_id` stays in the payload with no index (deduplication is by `event_id`)

## Blockers (the PR is not ready without these)

- [x] Register `EventsRepository` in `providers` of `EventsModule` (e2e fails with a DI error); check that `DatabaseModule` exports `DatabaseService`
- [x] Deduplicate by `event_id` in the database: `INSERT ... ON CONFLICT (event_id) DO NOTHING`; a new event returns `201`, a duplicate returns `200`
- [x] Decide what the repository returns so the service knows "new" vs "duplicate"; the controller must not return the raw Kysely result (it contains a `bigint`, which fails with `Do not know how to serialize a BigInt`)
- [x] Read events back: a simple `GET /events` (no filters, no pagination, with a `limit`, newest first) so the demo can show that data survives a restart
- [x] After changing `0001` (not merged yet): `npm run migrate:down`, then `npm run migrate` on the local database (it still has the old table shape)

## Should fix

- [x] Decide: the same `event_id` with a different body (decided: first wins, body not compared; client error, documented in the contract)
- [x] Upper limits on the other free strings and on `items` length (ids 128, `operation`/`code` 64, `referrer` 2048, `utm_*` 128, `items` 100). `quantity` 100000 (client: wholesale up to ~50000). `sum` / `unit_price`: no business cap, client does not want revenue rejected; only the safe-integer range applies
- [x] Unit tests for the new rules: invalid `event_id`, `purchase` from `web` / `mobile`, unknown `channel`, id longer than 128, `occurred_at` too far ahead / too old
- [x] e2e tests for `POST /events` on a real Postgres: valid event -> `201`, invalid -> `400` naming the field, duplicate `event_id` -> `200`
- [x] Check the real HTTP error response names the field and the reason (5+ invalid cases for the demo)
- [ ] CI: add env vars (`DATABASE_URL`, `REDIS_URL`, `KAFKA_BROKERS`), a Postgres service and a migrate step so `npm run test:e2e` passes in the workflow
- [ ] Check what Swagger shows for `POST /events` (Zod body schema); the contract doc must match the real behaviour
- [x] Update README if the way to run the app changed (docker compose, migrations, `.env`)
- [ ] Make `down()` in `0001` use the schema builder too (optional style point)

## Before opening the PR

- [ ] `docker compose up -d`, then from `server/`: `npm run migrate`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`
- [ ] Manual run: POST a valid event -> restart the service -> the event is still there; POST the same `event_id` twice
- [ ] Tell the client that Live Pulse relies on the shop for stable `user_id`s (comment already posted on issue #1)
- [ ] Open the PR with `Closes #1`

## Out of scope (next tickets)

- GET filters, pagination and the UI (Stage 1, "Event list API + simple UI")
- Dashboards: app-only conversion vs all orders, revenue split by guest vs registered, count of purchases without a link to checkout
- Authentication
