import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The Nest server serves Swagger at /api, so the dev proxy uses /server instead.
// In the browser call `/server/events`; Vite forwards it to `http://localhost:3000/events`.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/server': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/server/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
