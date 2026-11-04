import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The browser calls the API directly (VITE_API_BASE_URL), so the Nest server must
// allow this origin: http://localhost:5173 is in its CORS_ORIGIN.
export default defineConfig({
  plugins: [react()],
  // Resolves the `@/*` alias from tsconfig.app.json, for the dev server, build and Vitest.
  resolve: { tsconfigPaths: true },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
  },
});
