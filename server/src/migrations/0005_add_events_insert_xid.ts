import { Kysely, sql } from 'kysely';

// Two separate statements on purpose: ADD COLUMN with a volatile DEFAULT
// (pg_current_xact_id()) would rewrite the whole table under ACCESS EXCLUSIVE.
// Nullable ADD COLUMN and SET DEFAULT are metadata-only, so both are instant.
// Rows inserted before this migration keep NULL.
//
// bigint, not xid8: xid8 has no BRIN operator class (see 0006). The value is the
// 64-bit xid8 (epoch included), so it does not wrap around like the 32-bit xmin.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE events ADD COLUMN insert_xid bigint`.execute(db);
  await sql`
    ALTER TABLE events
    ALTER COLUMN insert_xid SET DEFAULT (pg_current_xact_id()::text::bigint)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE events DROP COLUMN insert_xid`.execute(db);
}
