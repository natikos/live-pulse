import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType('event_type')
    .asEnum(['page_view', 'purchase', 'error'])
    .execute();

  await db.schema
    .createType('event_source')
    .asEnum(['web', 'mobile', 'server'])
    .execute();

  await db.schema
    .createTable('events')
    .addColumn('id', 'integer', (col) =>
      col.generatedAlwaysAsIdentity().primaryKey(),
    )
    .addColumn('event_id', 'uuid', (col) => col.notNull().unique())
    .addColumn('type', sql`event_type`, (col) => col.notNull())
    .addColumn('payload', 'jsonb', (col) => col.notNull())
    .addColumn('source', sql`event_source`, (col) => col.notNull())
    .addColumn('user_id', 'text')
    .addColumn('device_id', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('occurred_at', 'timestamptz', (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE events`.execute(db);
  await sql`DROP TYPE event_source`.execute(db);
  await sql`DROP TYPE event_type`.execute(db);
}
