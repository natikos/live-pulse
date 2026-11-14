import { Kysely, sql } from 'kysely';

// Two separate statements on purpose: ADD COLUMN with a volatile DEFAULT
// (pg_current_xact_id()) would rewrite the whole table under ACCESS EXCLUSIVE.
// Nullable ADD COLUMN and SET DEFAULT are metadata-only, so both are instant.
// Rows inserted before this migration keep NULL.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE events ADD COLUMN insert_xid xid8`.execute(db);
  await sql`
    ALTER TABLE events ALTER COLUMN insert_xid SET DEFAULT pg_current_xact_id()
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE events DROP COLUMN insert_xid`.execute(db);
}
