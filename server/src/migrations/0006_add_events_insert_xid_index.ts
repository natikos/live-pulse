import { Kysely, sql } from 'kysely';

// CONCURRENTLY cannot run inside a transaction block, so the migrate script runs
// this migration, up and down, without one.
export const transaction = false;

// BRIN, not B-tree: the table is append-only, so insert_xid grows with the
// physical order and a BRIN range summary is precise. On 1M rows it is ~24 kB
// against ~6.7 MB for a B-tree and adds ~25% to bulk inserts against ~130%.
// If deletes or updates start reusing old pages, the ranges widen and the index
// slows down without an error: watch pg_stats.correlation for insert_xid.
// autosummarize: summarize a page range as soon as it is full, not at the next vacuum.
export async function up(db: Kysely<any>): Promise<void> {
  // An interrupted CONCURRENTLY build leaves an INVALID index behind, and
  // `CREATE INDEX IF NOT EXISTS` would skip it silently. Drop it and build again.
  await sql`DROP INDEX CONCURRENTLY IF EXISTS events_insert_xid_brin_idx`.execute(
    db,
  );
  await sql`
    CREATE INDEX CONCURRENTLY events_insert_xid_brin_idx
    ON events USING brin (insert_xid) WITH (autosummarize = on)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX CONCURRENTLY IF EXISTS events_insert_xid_brin_idx`.execute(
    db,
  );
}
