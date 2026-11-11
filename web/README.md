# Live Pulse web

React + TypeScript + Vite. Node 24 (see `.nvmrc`).

```bash
npm ci
npm run dev           # http://localhost:5173
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

## Talking to the server

The dev server proxies `/server/*` to the Nest server on `http://localhost:3000`
(the `/server` prefix is stripped). In the browser, call `fetch('/server/events')`
and it reaches `GET http://localhost:3000/events`. The proxy lives in `vite.config.ts`.
The prefix is `/server` and not `/api` because Nest already serves Swagger at `/api`.

## Tests

Vitest with jsdom and React Testing Library (`src/**/*.test.tsx`).
