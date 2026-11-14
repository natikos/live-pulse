import { randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { DatabaseService } from '../../src/database/database.service.js';
import { useTestApp } from '../helpers/app.js';
import { insertEvents, truncateEvents } from '../helpers/database.js';

describe('GET /events/has-new (e2e)', () => {
  const getApp = useTestApp();

  beforeEach(() => truncateEvents(getApp()));

  const loadList = async (query = '') => {
    const res = await request(getApp().getHttpServer())
      .get(`/events?${query}`)
      .expect(HttpStatus.OK);
    return res.body.snapshot as string;
  };

  const hasNew = (query: string) =>
    request(getApp().getHttpServer()).get(`/events/has-new?${query}`);

  it('is false when nothing arrived after the list was loaded', async () => {
    await insertEvents(getApp(), [{}, {}]);
    const snapshot = await loadList();

    const res = await hasNew(`snapshot=${snapshot}`).expect(HttpStatus.OK);

    expect(res.body).toEqual({ hasNew: false });
  });

  it('is true for a late event with an old occurred_at', async () => {
    await insertEvents(getApp(), [{}]);
    const snapshot = await loadList();
    await insertEvents(getApp(), [
      { occurred_at: new Date('2026-01-01T00:00:00Z') },
    ]);

    const res = await hasNew(`snapshot=${snapshot}`).expect(HttpStatus.OK);

    expect(res.body).toEqual({ hasNew: true });
  });

  it('is true for an empty list that gets its first event', async () => {
    const snapshot = await loadList();
    await insertEvents(getApp(), [{}]);

    const res = await hasNew(`snapshot=${snapshot}`).expect(HttpStatus.OK);

    expect(res.body).toEqual({ hasNew: true });
  });

  it('ignores new events that do not match the filters', async () => {
    const snapshot = await loadList('type=error');
    await insertEvents(getApp(), [{ type: 'page_view' }]);

    const res = await hasNew(`type=error&snapshot=${snapshot}`).expect(
      HttpStatus.OK,
    );

    expect(res.body).toEqual({ hasNew: false });
  });

  it('is true for an event that was uncommitted when the snapshot was taken', async () => {
    const db = getApp().get(DatabaseService);
    let snapshot = '';

    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto('events')
        .values({
          event_id: randomUUID(),
          type: 'page_view',
          source: 'web',
          user_id: null,
          device_id: 'device-1',
          payload: { page_id: 'home' },
          occurred_at: new Date(),
        })
        .execute();
      // Another connection reads while the insert above is still open.
      snapshot = await loadList();
    });

    const res = await hasNew(`snapshot=${snapshot}`).expect(HttpStatus.OK);

    expect(res.body).toEqual({ hasNew: true });
  });

  it('rejects a missing or malformed snapshot', async () => {
    await hasNew('').expect(HttpStatus.BAD_REQUEST);
    await hasNew('snapshot=abc').expect(HttpStatus.BAD_REQUEST);
  });

  it('rejects a snapshot that is well-formed but inconsistent', async () => {
    const res = await hasNew('snapshot=5:3:').expect(HttpStatus.BAD_REQUEST);

    expect(res.body.message).toEqual(['snapshot: not a valid snapshot']);
  });
});
