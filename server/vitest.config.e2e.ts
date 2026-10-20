import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: './test/global-setup.ts',
    // All files share one Postgres; a TRUNCATE in one file would wipe another's data.
    fileParallelism: false,
  },
});
