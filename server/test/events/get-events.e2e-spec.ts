import { randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { useTestApp } from '../helpers/app.js';
import { insertEvents, truncateEvents } from '../helpers/database.js';

describe('GET /events (e2e)', () => {
  const getApp = useTestApp();

  beforeEach(() => truncateEvents(getApp()));

  it('returns stored events, newest first', async () => {
    // Inserted out of order, and occurred_at runs opposite to created_at, so
    // sorting by insertion order, id or occurred_at would all give a wrong result.
    await insertEvents(getApp(), [
      {
        event_id: '11111111-1111-4111-8111-111111111111',
        occurred_at: new Date('2026-10-20T12:00:00Z'),
        created_at: new Date('2026-10-20T10:00:00Z'),
      },
      {
        event_id: '33333333-3333-4333-8333-333333333333',
        occurred_at: new Date('2026-10-20T10:00:00Z'),
        created_at: new Date('2026-10-20T12:00:00Z'),
      },
      {
        event_id: '22222222-2222-4222-8222-222222222222',
        occurred_at: new Date('2026-10-20T11:00:00Z'),
        created_at: new Date('2026-10-20T11:00:00Z'),
      },
    ]);

    const res = await request(getApp().getHttpServer())
      .get('/events')
      .expect(HttpStatus.OK);

    expect(res.body.map((e: { event_id: string }) => e.event_id)).toEqual([
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('returns at most the default limit', async () => {
    const total = 11;
    const firstCreatedAt = Date.parse('2026-10-20T10:00:00Z');

    // created_at grows with the index, so the newest event is the last one.
    const rows = Array.from({ length: total }, (_, i) => ({
      event_id: randomUUID(),
      created_at: new Date(firstCreatedAt + i * 60_000),
    }));
    await insertEvents(getApp(), rows);

    const res = await request(getApp().getHttpServer())
      .get('/events')
      .expect(HttpStatus.OK);

    expect(res.body).toHaveLength(10);
    // The oldest row (rows[0]) is the one left out; the rest come newest first.
    expect(res.body.map((e: { event_id: string }) => e.event_id)).toEqual(
      rows
        .slice(1)
        .reverse()
        .map((row) => row.event_id),
    );
  });
});
