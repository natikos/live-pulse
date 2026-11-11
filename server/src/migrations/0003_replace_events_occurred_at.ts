import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('events').dropColumn('occurred_at').execute();
  await db.schema
    .alterTable('events')
    .renameColumn('occurred_at_ms', 'occurred_at')
    .execute();
  await db.schema
    .alterTable('events')
    .alterColumn('occurred_at', (b) => b.setNotNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('events')
    .renameColumn('occurred_at', 'occurred_at_ms')
    .execute();
  await db.schema
    .alterTable('events')
    .alterColumn('occurred_at_ms', (col) => col.dropNotNull())
    .execute();
  await db.schema
    .alterTable('events')
    .addColumn('occurred_at', 'timestamptz')
    .execute();
  await sql`UPDATE events SET occurred_at = occurred_at_ms`.execute(db);
  await db.schema
    .alterTable('events')
    .alterColumn('occurred_at', (col) => col.setNotNull())
    .execute();
}
