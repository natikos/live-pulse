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
    // sorting by insertion order, id or created_at would all give a wrong result.
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
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]);
  });

  it('exposes only the public fields of an event', async () => {
    await insertEvents(getApp(), [{}]);

    const res = await request(getApp().getHttpServer())
      .get('/events')
      .expect(HttpStatus.OK);

    // Guards against `selectAll()` leaking the internal id and created_at.
    expect(Object.keys(res.body[0]).sort()).toEqual([
      'device_id',
      'event_id',
      'occurred_at',
      'payload',
      'source',
      'type',
      'user_id',
    ]);
  });

  describe('limit', () => {
    // created_at and occurred_at grow with the index, so the newest event is the
    // last one and the oldest rows are the ones a limit cuts off.
    async function insertNumberedEvents(total: number) {
      const firstCreatedAt = Date.parse('2026-10-20T10:00:00Z');
      const rows = Array.from({ length: total }, (_, i) => ({
        event_id: randomUUID(),
        occurred_at: new Date(firstCreatedAt + i * 60_000),
        created_at: new Date(firstCreatedAt + i * 60_000),
      }));
      await insertEvents(getApp(), rows);
      return rows;
    }

    const idsNewestFirst = (rows: Array<{ event_id: string }>, count: number) =>
      rows
        .slice(-count)
        .reverse()
        .map((row) => row.event_id);

    it('returns at most 50 events by default', async () => {
      const rows = await insertNumberedEvents(51);

      const res = await request(getApp().getHttpServer())
        .get('/events')
        .expect(HttpStatus.OK);

      expect(res.body).toHaveLength(50);
      expect(res.body.map((e: { event_id: string }) => e.event_id)).toEqual(
        idsNewestFirst(rows, 50),
      );
    });

    it('returns the newest events up to the requested limit', async () => {
      const rows = await insertNumberedEvents(5);

      const res = await request(getApp().getHttpServer())
        .get('/events?limit=3')
        .expect(HttpStatus.OK);

      expect(res.body.map((e: { event_id: string }) => e.event_id)).toEqual(
        idsNewestFirst(rows, 3),
      );
    });

    it('returns everything when fewer events exist than the limit', async () => {
      await insertNumberedEvents(2);

      const res = await request(getApp().getHttpServer())
        .get('/events?limit=100')
        .expect(HttpStatus.OK);

      expect(res.body).toHaveLength(2);
    });
  });
});
