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

    expect(res.body.items.map((e: { event_id: string }) => e.event_id)).toEqual(
      [
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
      ],
    );
  });

  it('exposes only the public fields of an event', async () => {
    await insertEvents(getApp(), [{}]);

    const res = await request(getApp().getHttpServer())
      .get('/events')
      .expect(HttpStatus.OK);

    expect(Object.keys(res.body).sort()).toEqual([
      'items',
      'nextCursor',
      'snapshot',
    ]);
    // Guards against `selectAll()` leaking the internal id and created_at.
    expect(Object.keys(res.body.items[0]).sort()).toEqual([
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

      expect(res.body.items).toHaveLength(50);
      expect(
        res.body.items.map((e: { event_id: string }) => e.event_id),
      ).toEqual(idsNewestFirst(rows, 50));
    });

    it('returns the newest events up to the requested limit', async () => {
      const rows = await insertNumberedEvents(5);

      const res = await request(getApp().getHttpServer())
        .get('/events?limit=3')
        .expect(HttpStatus.OK);

      expect(
        res.body.items.map((e: { event_id: string }) => e.event_id),
      ).toEqual(idsNewestFirst(rows, 3));
    });

    it('returns everything when fewer events exist than the limit', async () => {
      await insertNumberedEvents(2);

      const res = await request(getApp().getHttpServer())
        .get('/events?limit=100')
        .expect(HttpStatus.OK);

      expect(res.body.items).toHaveLength(2);
    });
  });

  const T0 = Date.parse('2026-10-20T10:00:00Z');
  const MINUTE = 60_000;

  function get(query = '') {
    return request(getApp().getHttpServer()).get(`/events?${query}`);
  }

  const idsOf = (body: { items: Array<{ event_id: string }> }) =>
    body.items.map((e) => e.event_id);

  // Rows with occurred_at = T0 + minutes[i]; the returned array keeps the
  // insertion order, which is also the id order.
  async function insertAt(minutes: number[]) {
    const rows = minutes.map((m) => ({
      event_id: randomUUID(),
      occurred_at: new Date(T0 + m * MINUTE),
    }));
    await insertEvents(getApp(), rows);
    return rows;
  }

  // Follows nextCursor to the end. The page bound turns an endless cursor loop
  // into a failure instead of a hang.
  async function walk(query: string, cursor?: string | null) {
    const ids: string[] = [];
    for (let page = 0; page < 100; page++) {
      const params = new URLSearchParams(query);
      if (cursor) {
        params.set('cursor', cursor);
      }
      const res = await get(params.toString()).expect(HttpStatus.OK);
      ids.push(...idsOf(res.body));
      cursor = res.body.nextCursor;
      if (!cursor) {
        return ids;
      }
    }
    throw new Error('nextCursor never became null');
  }

  describe('paging', () => {
    it('returns a null nextCursor when everything fits on one page', async () => {
      await insertAt([0, 1, 2]);

      const res = await get('limit=3').expect(HttpStatus.OK);

      expect(res.body.items).toHaveLength(3);
      expect(res.body.nextCursor).toBeNull();
    });

    it('returns a nextCursor when more events exist', async () => {
      await insertAt([0, 1, 2, 3]);

      const res = await get('limit=3').expect(HttpStatus.OK);

      expect(res.body.items).toHaveLength(3);
      expect(typeof res.body.nextCursor).toBe('string');
    });

    it('returns a snapshot on the first page only', async () => {
      await insertAt([0, 1, 2, 3]);

      const first = await get('limit=3').expect(HttpStatus.OK);
      const second = await get(
        `limit=3&cursor=${first.body.nextCursor}`,
      ).expect(HttpStatus.OK);

      expect(first.body.snapshot).toMatch(/^\d+:\d+:/);
      expect(second.body.snapshot).toBeNull();
    });

    it('does not return an empty last page when the total is a multiple of the limit', async () => {
      await insertAt([0, 1, 2, 3, 4, 5]);

      const first = await get('limit=3').expect(HttpStatus.OK);
      const second = await get(
        `limit=3&cursor=${first.body.nextCursor}`,
      ).expect(HttpStatus.OK);

      expect(second.body.items).toHaveLength(3);
      expect(second.body.nextCursor).toBeNull();
    });

    it('visits every event exactly once, newest first', async () => {
      const rows = await insertAt([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      const ids = await walk('limit=3');

      expect(ids).toEqual(rows.map((r) => r.event_id).reverse());
    });

    it('keeps events with the same occurred_at in order across page boundaries', async () => {
      // One timestamp for all rows: only the id tie-breaker orders them.
      const rows = await insertAt([0, 0, 0, 0, 0, 0, 0]);

      const ids = await walk('limit=2');

      expect(ids).toEqual(rows.map((r) => r.event_id).reverse());
    });

    it('keeps events one millisecond apart in order across page boundaries', async () => {
      // A cursor that loses sub-second precision would repeat or skip these.
      const rows = [0, 1, 2, 3, 4].map((ms) => ({
        event_id: randomUUID(),
        occurred_at: new Date(T0 + ms),
      }));
      await insertEvents(getApp(), rows);

      const ids = await walk('limit=2');

      expect(ids).toEqual(rows.map((r) => r.event_id).reverse());
    });

    it('is not shifted by newer events that arrive while paging', async () => {
      const rows = await insertAt([0, 1, 2, 3, 4, 5]);
      const first = await get('limit=3').expect(HttpStatus.OK);

      await insertAt([10, 11]);
      const rest = await walk('limit=3', first.body.nextCursor);

      // With OFFSET the two new rows would push the last of page 1 onto page 2.
      expect(idsOf(first.body)).toEqual(
        [5, 4, 3].map((i) => rows[i]!.event_id),
      );
      expect(rest).toEqual([2, 1, 0].map((i) => rows[i]!.event_id));
    });

    it('still returns an older event that arrives late', async () => {
      const rows = await insertAt([10, 11, 12, 13, 14, 15]);
      const first = await get('limit=3').expect(HttpStatus.OK);

      // Older than everything seen so far, e.g. from a client that was offline.
      const [late] = await insertAt([0]);
      const rest = await walk('limit=3', first.body.nextCursor);

      expect(rest).toEqual([
        ...[2, 1, 0].map((i) => rows[i]!.event_id),
        late!.event_id,
      ]);
    });

    it('applies the filters to every page', async () => {
      const rows = Array.from({ length: 7 }, (_, i) => ({
        event_id: randomUUID(),
        type: i % 2 === 0 ? ('error' as const) : ('page_view' as const),
        payload:
          i % 2 === 0
            ? { operation: 'create_order', code: 'timeout' }
            : { page_id: 'home' },
        occurred_at: new Date(T0 + i * MINUTE),
      }));
      await insertEvents(getApp(), rows);

      const ids = await walk('type=error&limit=2');

      expect(ids).toEqual(
        rows
          .filter((r) => r.type === 'error')
          .map((r) => r.event_id)
          .reverse(),
      );
    });

    it.each([
      ['not base64url', '***'],
      ['not JSON', Buffer.from('not json').toString('base64url')],
      [
        'the wrong shape',
        Buffer.from(JSON.stringify({ occurredAt: 'x', id: 0 })).toString(
          'base64url',
        ),
      ],
    ])('rejects a cursor that is %s with 400', async (_label, cursor) => {
      await get(`cursor=${cursor}`).expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('filters', () => {
    const typed = (
      type: 'page_view' | 'purchase' | 'error',
      minute: number,
    ) => ({
      event_id: randomUUID(),
      type,
      source: type === 'purchase' ? ('server' as const) : ('web' as const),
      payload:
        type === 'purchase'
          ? {
              order_id: 'o-1',
              channel: 'app' as const,
              sum: 100,
              items: [{ id: 'a', unit_price: 100, quantity: 1 }],
            }
          : type === 'error'
            ? { operation: 'create_order', code: 'timeout' }
            : { page_id: 'home' },
      occurred_at: new Date(T0 + minute * MINUTE),
    });

    it('filters by one type', async () => {
      const rows = [
        typed('page_view', 0),
        typed('error', 1),
        typed('error', 2),
      ];
      await insertEvents(getApp(), rows);

      const res = await get('type=error').expect(HttpStatus.OK);

      expect(idsOf(res.body)).toEqual([rows[2]!.event_id, rows[1]!.event_id]);
    });

    it('filters by several types', async () => {
      const rows = [
        typed('page_view', 0),
        typed('purchase', 1),
        typed('error', 2),
      ];
      await insertEvents(getApp(), rows);

      const res = await get('type=error&type=purchase').expect(HttpStatus.OK);

      expect(idsOf(res.body)).toEqual([rows[2]!.event_id, rows[1]!.event_id]);
    });

    it('includes both ends of the time range', async () => {
      const rows = await insertAt([0, 1, 2, 3, 4]);

      const res = await get(
        `startDate=${T0 + MINUTE}&endDate=${T0 + 3 * MINUTE}`,
      ).expect(HttpStatus.OK);

      expect(idsOf(res.body)).toEqual([3, 2, 1].map((i) => rows[i]!.event_id));
    });

    it('combines type and time range', async () => {
      const rows = [
        typed('error', 0),
        typed('error', 2),
        typed('page_view', 2),
        typed('error', 4),
      ];
      await insertEvents(getApp(), rows);

      const res = await get(
        `type=error&startDate=${T0 + MINUTE}&endDate=${T0 + 3 * MINUTE}`,
      ).expect(HttpStatus.OK);

      expect(idsOf(res.body)).toEqual([rows[1]!.event_id]);
    });

    it('returns an empty page when nothing matches', async () => {
      await insertAt([0, 1]);

      const res = await get('type=error').expect(HttpStatus.OK);

      expect(res.body).toEqual({
        items: [],
        nextCursor: null,
        snapshot: expect.stringMatching(/^\d+:\d+:/),
      });
    });

    it.each([
      ['an unknown type', 'type=refund'],
      ['a start after the end', `startDate=${T0 + MINUTE}&endDate=${T0}`],
      ['a limit above the maximum', 'limit=101'],
    ])('rejects %s with 400', async (_label, query) => {
      await get(query).expect(HttpStatus.BAD_REQUEST);
    });
  });
});
