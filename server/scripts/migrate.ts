import 'dotenv/config';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { parseArgs } from 'node:util';
import { Kysely, PostgresDialect, sql } from 'kysely';
import {
  FileMigrationProvider,
  Migrator,
  type MigrationInfo,
  type MigrationResult,
} from 'kysely/migration';
import { Pool } from 'pg';

// Usage: `node scripts/migrate.ts` (apply all pending migrations) or
// `node scripts/migrate.ts down` (revert the last one).
//
// Migrations run one at a time, each in its own transaction. A migration that
// cannot run in one (CREATE INDEX CONCURRENTLY) opts out with
// `export const transaction = false`, which covers both its up and its down.
const { positionals } = parseArgs({ allowPositionals: true });
const direction = positionals[0] ?? 'up';
if (direction !== 'up' && direction !== 'down') {
  throw new Error(`Unknown direction "${direction}", expected "up" or "down"`);
}

// Held for the whole run, so two deploys cannot interleave their steps. It must
// differ from the id Kysely locks on for every step it runs. A second run fails
// at once instead of waiting: a statement blocked on this lock would be a
// running transaction, and CREATE INDEX CONCURRENTLY in the first run waits for
// every such transaction to end, a deadlock Postgres cannot see.
const RUN_LOCK_ID = 7_243_001;

async function tryAcquireRunLock(connection: Kysely<unknown>) {
  const { rows } = await sql<{
    locked: boolean;
  }>`select pg_try_advisory_lock(${sql.lit(RUN_LOCK_ID)}) as locked`.execute(
    connection,
  );
  return rows[0]?.locked === true;
}

// `transaction` is not part of Kysely's Migration type, so it is read here and
// anything but a boolean is rejected.
function runsInTransaction({ name, migration }: MigrationInfo): boolean {
  const flag = (migration as { transaction?: unknown }).transaction;
  if (flag === undefined) {
    return true;
  }
  if (typeof flag !== 'boolean') {
    throw new Error(
      `Migration "${name}": \`transaction\` must be a boolean, got ${typeof flag}`,
    );
  }
  return flag;
}

// The migration Kysely will run next: the first pending one going up, the last
// executed one going down.
async function nextMigration(migrator: Migrator) {
  const migrations = await migrator.getMigrations();
  if (direction === 'up') {
    return migrations.find((it) => !it.executedAt);
  }
  return migrations
    .filter((it) => it.executedAt)
    .sort(
      (a, b) =>
        (a.executedAt?.getTime() ?? 0) - (b.executedAt?.getTime() ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .at(-1);
}

function log(result: MigrationResult) {
  const done = result.direction === 'Up' ? 'applied' : 'reverted';
  const action = result.direction === 'Up' ? 'apply' : 'revert';

  if (result.status === 'Success') {
    console.log(`migration "${result.migrationName}" was ${done} successfully`);
  } else if (result.status === 'Error') {
    console.error(`failed to ${action} migration "${result.migrationName}"`);
  }
}

// Returns false when a migration failed.
async function run(migrator: Migrator): Promise<boolean> {
  let ran = false;
  do {
    const next = await nextMigration(migrator);
    if (!next) {
      if (!ran) {
        console.log('nothing to do');
      }
      return true;
    }

    const options = { disableTransactions: !runsInTransaction(next) };
    const { error, results } =
      direction === 'up'
        ? await migrator.migrateUp(options)
        : await migrator.migrateDown(options);

    ran = true;
    results?.forEach(log);
    if (error) {
      console.error('failed to migrate');
      console.error(error);
      return false;
    }
  } while (direction === 'up');

  return true;
}

async function migrate(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        // One connection holds the run lock, another runs the migrations.
        max: 2,
        connectionTimeoutMillis: 10_000,
        application_name: 'live-pulse-migrate',
      }),
    }),
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

  try {
    // The lock belongs to this connection and is released when it closes.
    return await db.connection().execute(async (lockConnection) => {
      if (!(await tryAcquireRunLock(lockConnection))) {
        console.error('another migration run is in progress');
        return false;
      }
      return run(migrator);
    });
  } finally {
    await db.destroy();
  }
}

process.exitCode = (await migrate()) ? 0 : 1;
