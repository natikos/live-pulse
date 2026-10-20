import 'dotenv/config';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { Kysely, PostgresDialect } from 'kysely';
import { FileMigrationProvider, Migrator } from 'kysely/migration';
import { Pool } from 'pg';

// Usage: `node scripts/migrate.ts` (up to latest) or `node scripts/migrate.ts down` (revert the last one).
const direction = process.argv[2] ?? 'up';
if (direction !== 'up' && direction !== 'down') {
  throw new Error(`Unknown direction "${direction}", expected "up" or "down"`);
}

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new Pool({ connectionString }) }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      // Must be an absolute path.
      migrationFolder: path.join(import.meta.dirname, '../src/migrations'),
    }),
  });

  const { error, results } =
    direction === 'up'
      ? await migrator.migrateToLatest()
      : await migrator.migrateDown();

  results?.forEach((it) => {
    const done = it.direction === 'Up' ? 'applied' : 'reverted';
    const action = it.direction === 'Up' ? 'apply' : 'revert';

    if (it.status === 'Success') {
      console.log(`migration "${it.migrationName}" was ${done} successfully`);
    } else if (it.status === 'Error') {
      console.error(`failed to ${action} migration "${it.migrationName}"`);
    }
  });

  await db.destroy();

  if (error) {
    console.error('failed to migrate');
    console.error(error);
    process.exit(1);
  }
}

await migrate();
