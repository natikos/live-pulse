import { Kysely, sql } from 'kysely';

// CONCURRENTLY cannot run inside a transaction block, so the migrate script runs
// this migration, up and down, without one.
export const transaction = false;

export async function up(db: Kysely<any>): Promise<void> {
  // An interrupted CONCURRENTLY build leaves an INVALID index behind, and
  // `CREATE INDEX IF NOT EXISTS` would skip it silently. Drop it and build again.
  await sql`DROP INDEX CONCURRENTLY IF EXISTS events_occurred_at_id_type_idx`.execute(
    db,
  );
  await sql`
    CREATE INDEX CONCURRENTLY events_occurred_at_id_type_idx
    ON events (occurred_at, id, type)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX CONCURRENTLY IF EXISTS events_occurred_at_id_type_idx`.execute(
    db,
  );
}
