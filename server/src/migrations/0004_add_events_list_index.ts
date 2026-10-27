import { Kysely, sql } from 'kysely';

// Run with `npm run migrate:no-tx`: CREATE INDEX CONCURRENTLY cannot run inside a
// transaction block, and the migrator wraps every migration in one by default.
export async function up(db: Kysely<any>): Promise<void> {
  // An interrupted CONCURRENTLY build leaves an INVALID index behind, and
  // `CREATE INDEX IF NOT EXISTS` would skip it silently. Drop it and build again.
  await sql`DROP INDEX IF EXISTS events_occurred_at_id_type_idx`.execute(db);
  await sql`
    CREATE INDEX CONCURRENTLY events_occurred_at_id_type_idx
    ON events (occurred_at, id, type)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS events_occurred_at_id_type_idx`.execute(db);
}
