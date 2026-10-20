import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { sql, type Insertable } from 'kysely';
import { DatabaseService } from '../../src/database/database.service.js';
import type { EventsTable } from '../../src/database/schema.js';

// Uses the app's own connection pool, so no second connection is opened.
export async function truncateEvents(app: INestApplication): Promise<void> {
  const db = app.get(DatabaseService);
  await sql`TRUNCATE TABLE events RESTART IDENTITY`.execute(db);
}

// Bypasses the API, so a test can set created_at.
export async function insertEvents(
  app: INestApplication,
  overrides: Array<Partial<Insertable<EventsTable>>>,
): Promise<void> {
  const db = app.get(DatabaseService);
  const rows: Array<Insertable<EventsTable>> = overrides.map((override) => ({
    event_id: randomUUID(),
    type: 'page_view',
    source: 'web',
    user_id: null,
    device_id: 'device-1',
    payload: { page_id: 'home' },
    occurred_at: new Date(),
    ...override,
  }));
  await db.insertInto('events').values(rows).execute();
}

export async function countEvents(app: INestApplication): Promise<number> {
  const db = app.get(DatabaseService);
  const { count } = await db
    .selectFrom('events')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .executeTakeFirstOrThrow();
  return Number(count);
}
