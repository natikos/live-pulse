import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const SERVER_DIR = path.join(import.meta.dirname, '..');

// E2E_EXTERNAL_DB=1: use the DATABASE_URL you provide (CI service container)
// instead of managing the compose container.
const useExternalDb = process.env.E2E_EXTERNAL_DB === '1';

function compose(...args: string[]): void {
  const COMPOSE_FILE = path.join(SERVER_DIR, '../docker-compose.yml');

  execFileSync(
    'docker',
    ['compose', '-f', COMPOSE_FILE, '--profile', 'test', ...args],
    { stdio: 'inherit' },
  );
}

export function setup(): void {
  try {
    if (!useExternalDb) {
      compose('up', '-d', '--wait', 'postgres-test');
      const TEST_DATABASE_URL = `postgresql://livepulse:livepulse@localhost:5433/livepulse_test`;
      // Workers inherit this; dotenv does not override variables already set,
      // so the dev database from .env is never used by e2e.
      process.env.DATABASE_URL = TEST_DATABASE_URL;
    }

    execFileSync('node', ['scripts/migrate.ts'], {
      cwd: SERVER_DIR,
      stdio: 'inherit',
      env: process.env,
    });
  } catch (error) {
    // Vitest does not call teardown when setup throws, so clean up here.
    teardown();
    throw error;
  }
}

export function teardown(): void {
  if (!useExternalDb) {
    compose('rm', '--stop', '--force', '--volumes', 'postgres-test');
  }
}
