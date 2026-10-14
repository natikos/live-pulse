# Live Pulse: server

NestJS + TypeScript backend for the Live Pulse real-time event dashboard: event ingest, processing into Postgres, alerts, and the WebSocket gateway.

The server starts as a single Nest app (modular monolith). At Stage 5 it is split into four apps in Nest monorepo mode: `ingest-service`, `processor-service`, `alert-service`, and `gateway`. See [docs/ROADMAP.md](../docs/ROADMAP.md) for the stages and [docs/DECISIONS.md](../docs/DECISIONS.md) for why things are built the way they are.

## Requirements

- Node 24 (see [.nvmrc](.nvmrc))
- npm 12.2.0 (CI pins this version; `engine-strict` in [.npmrc](.npmrc) rejects older npm and Node versions)
- Docker, for the infrastructure (Postgres, Redis, Kafka, RabbitMQ, and observability)

## Setup

Start the infrastructure from the repository root:

```bash
docker compose up -d                 # core: Postgres, Redis, Kafka
docker compose --profile rabbit up -d    # + RabbitMQ
docker compose --profile tracing up -d   # + Jaeger
```

Install dependencies and run the app from this directory:

```bash
cd server
npm ci
npm run start:dev
```

## Checks before a PR

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs these on every pull request. Run them locally first:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

All available scripts are listed in [package.json](package.json).

## Project layout

```
server/
├── src/          application code (modules, controllers, services)
├── test/         e2e tests
├── nest-cli.json
├── vitest.config.ts
└── vitest.config.e2e.ts
```

Modules talk to each other only through their public interfaces or events. Do not import another module's internals. This keeps the Stage 5 split into services a mechanical change instead of a rewrite.

## Documentation

- [docs/topics/](../docs/topics/): handbook chapters on each backend topic
- [docs/STUDY_NOTES.md](../docs/STUDY_NOTES.md): what went wrong and what was learned, in story form
- [docs/DECISIONS.md](../docs/DECISIONS.md): decision log with alternatives and trade-offs
- [docs/EXPERIMENTS.md](../docs/EXPERIMENTS.md): break-and-fix experiments
