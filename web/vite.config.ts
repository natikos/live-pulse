import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    env: { VITE_API_BASE_URL: 'http://localhost:3000' },
  },
});
