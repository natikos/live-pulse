import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TYPE event_type AS ENUM ('page_view', 'purchase', 'error')`.execute(
    db,
  );

  await sql`CREATE TYPE event_source AS ENUM ('web', 'mobile', 'server')`.execute(
    db,
  );

  await sql`
    CREATE TABLE events (
      id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      type        event_type   NOT NULL,
      payload     jsonb        NOT NULL,
      source      event_source NOT NULL,
      user_id     text,
      device_id   text,
      created_at  timestamptz  NOT NULL DEFAULT now(),
      occurred_at timestamptz  NOT NULL
    )
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE events`.execute(db);
  await sql`DROP TYPE event_source`.execute(db);
  await sql`DROP TYPE event_type`.execute(db);
}
