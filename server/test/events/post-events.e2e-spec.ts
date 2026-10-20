import { HttpStatus } from '@nestjs/common';
import { useTestApp } from '../helpers/app.js';
import { countEvents, truncateEvents } from '../helpers/database.js';
import { validPageView } from '../helpers/events.js';
import request from 'supertest';
import { DatabaseService } from '../../src/database/database.service.js';

describe('POST /events (e2e)', () => {
  const getApp = useTestApp();

  beforeEach(() => truncateEvents(getApp()));

  const post = (body: object) =>
    request(getApp().getHttpServer()).post('/events').send(body);

  it('creates a valid event and returns 201 { status: "created" }', async () => {
    const body = validPageView();
    const res = await request(getApp().getHttpServer())
      .post('/events')
      .send(body)
      .expect(HttpStatus.CREATED);

    expect(res.body).toEqual({ status: 'created' });

    const db = getApp().get(DatabaseService);

    const event = await db
      .selectFrom('events')
      .selectAll()
      .where('event_id', '=', body.event_id)
      .executeTakeFirstOrThrow();

    expect(event).toMatchObject({
      ...body,
      occurred_at: new Date(body.occurred_at),
      user_id: null,
    });
  });

  it('returns 200 { status: "duplicate" } for a repeated event_id', async () => {
    const body = validPageView();

    const first = await request(getApp().getHttpServer())
      .post('/events')
      .send(body)
      .expect(HttpStatus.CREATED);
    expect(first.body).toEqual({ status: 'created' });

    const second = await request(getApp().getHttpServer())
      .post('/events')
      .send(body)
      .expect(HttpStatus.OK);
    expect(second.body).toEqual({ status: 'duplicate' });

    const db = getApp().get(DatabaseService);
    const events = await db
      .selectFrom('events')
      .selectAll()
      .where('event_id', '=', body.event_id)
      .execute();

    expect(events).toMatchObject([
      { ...body, occurred_at: new Date(body.occurred_at) },
    ]);
  });

  it('keeps the first body when event_id is reused with a different body', async () => {
    const first = validPageView({ device_id: 'device-1' });
    await post(first).expect(HttpStatus.CREATED);

    const res = await post({ ...first, device_id: 'device-2' }).expect(
      HttpStatus.OK,
    );
    expect(res.body).toEqual({ status: 'duplicate' });

    const db = getApp().get(DatabaseService);
    const events = await db
      .selectFrom('events')
      .select('device_id')
      .where('event_id', '=', first.event_id)
      .execute();

    expect(events).toEqual([{ device_id: 'device-1' }]);
  });

  describe('rejects an invalid event with 400 naming the field', () => {
    const purchase = {
      order_id: 'order-1',
      channel: 'app',
      sum: 100,
      items: [{ id: 'item-1', unit_price: 100, quantity: 1 }],
    };

    it.each([
      ['an unknown type', validPageView({ type: 'unknown' }), /^type:/],
      [
        'occurred_at in seconds',
        validPageView({ occurred_at: Math.floor(Date.now() / 1000) }),
        /^occurred_at:/,
      ],
      [
        'a missing device_id from web',
        validPageView({ device_id: undefined }),
        /^device_id:/,
      ],
      [
        'a purchase from web',
        validPageView({ type: 'purchase', payload: purchase }),
        /^source:/,
      ],
      [
        'a device_id over the length limit',
        validPageView({ device_id: 'x'.repeat(129) }),
        /^device_id:.*128/,
      ],
      [
        'a payload.page_id over the length limit',
        validPageView({ payload: { page_id: 'x'.repeat(129) } }),
        /^payload\.page_id:.*128/,
      ],
      ['an unknown key', validPageView({ foo: 'bar' }), /"foo"/],
    ])('%s', async (_name, body, message) => {
      const res = await post(body).expect(HttpStatus.BAD_REQUEST);

      expect(res.body.message).toEqual([expect.stringMatching(message)]);
      expect(await countEvents(getApp())).toBe(0);
    });
  });
});
