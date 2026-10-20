import { describe, it, expect, vi, afterEach } from 'vitest';
import { recordEventSchema, type RecordEventDto } from './record-event.dto.js';

vi.mock('../../config.js', () => ({
  config: { maxClockSkewMs: 300_000, maxEventAgeMs: 2_592_000_000 },
}));

const EVENT_ID = '0b6f6f0e-5a52-4c5e-9f3a-2f1f7f6a8d11';

// Rules come from docs/EVENT_CONTRACT.md.
describe('recordEventSchema', () => {
  describe('valid input', () => {
    it('accepts a valid purchase', () => {
      const validPurchase: RecordEventDto = {
        event_id: EVENT_ID,
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
          channel: 'app',
          sum: 100,
          items: [
            {
              id: 'item123',
              unit_price: 50,
              quantity: 2,
            },
          ],
        },
      };
      const validationResult = recordEventSchema.safeParse(validPurchase);
      expect(validationResult.success).toBe(true);
    });

    it('accepts a page view with an unknown page_id', () => {
      const unknownPageView: RecordEventDto = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'page_view',
        payload: {
          page_id: 'unknown_page',
        },
      };
      const { success, data } = recordEventSchema.safeParse(unknownPageView);

      expect(success).toBe(true);
      expect(data).toMatchObject({
        type: 'page_view',
        payload: { page_id: 'unknown_page' },
      });
    });

    it('accepts an error with unknown code and operation', () => {
      const unknownError: RecordEventDto = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'error',
        payload: {
          code: 'unknown_code',
          operation: 'unknown_operation',
        },
      };

      const { success, data } = recordEventSchema.safeParse(unknownError);

      expect(success).toBe(true);
      expect(data).toMatchObject({
        type: 'error',
        payload: {
          code: 'unknown_code',
          operation: 'unknown_operation',
        },
      });
    });

    it('accepts an error with unknown page_id', () => {
      const unknownPageError: RecordEventDto = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'error',
        payload: {
          page_id: 'unknown_page',
          operation: 'unknown_operation',
          code: 'unknown_code',
        },
      };

      const { success, data } = recordEventSchema.safeParse(unknownPageError);

      expect(success).toBe(true);
      expect(data).toMatchObject({
        type: 'error',
        payload: {
          page_id: 'unknown_page',
          operation: 'unknown_operation',
          code: 'unknown_code',
        },
      });
    });
  });

  describe('envelope', () => {
    it('rejects an unknown type', () => {
      const unknownTypeEvent = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'unknown_type',
      };

      const { success, error } = recordEventSchema.safeParse(unknownTypeEvent);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([{ path: ['type'] }]);
    });

    it('rejects an unknown source', () => {
      const unknownSourceEvent = {
        event_id: EVENT_ID,
        source: 'unknown_source',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'page_view',
        payload: {
          page_id: 'checkout',
        },
      };

      const { success, error } =
        recordEventSchema.safeParse(unknownSourceEvent);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([{ path: ['source'] }]);
    });

    it('rejects an event_id that is not a UUID', () => {
      const invalidEventId = {
        event_id: 'not-a-uuid',
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'page_view',
        payload: { page_id: 'checkout' },
      };

      const { success, error } = recordEventSchema.safeParse(invalidEventId);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([{ path: ['event_id'] }]);
    });

    it.each(['user_id', 'device_id'])(
      'rejects a %s longer than 128 characters',
      (field) => {
        const tooLongId = {
          event_id: EVENT_ID,
          source: 'web',
          occurred_at: Date.now(),
          user_id: 'user123',
          device_id: 'device123',
          type: 'page_view',
          payload: { page_id: 'checkout' },
          [field]: 'x'.repeat(129),
        };

        const { success, error } = recordEventSchema.safeParse(tooLongId);

        expect(success).toBe(false);
        expect(error?.issues).toMatchObject([
          { code: 'too_big', path: [field] },
        ]);
      },
    );

    it('accepts a user_id of exactly 128 characters', () => {
      const maxLengthUserId = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'x'.repeat(128),
        device_id: 'device123',
        type: 'page_view',
        payload: { page_id: 'checkout' },
      };

      const { success } = recordEventSchema.safeParse(maxLengthUserId);

      expect(success).toBe(true);
    });

    it('rejects occurred_at in seconds', () => {
      const secondsEvent = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Math.floor(Date.now() / 1000),
        user_id: 'user123',
        device_id: 'device123',
        type: 'error',
        payload: {
          code: 'unknown_code',
          operation: 'unknown_operation',
        },
      };

      const { success, error } = recordEventSchema.safeParse(secondsEvent);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([{ path: ['occurred_at'] }]);
    });

    describe('occurred_at in the future', () => {
      const NOW = 1_800_000_000_000;
      const SKEW = 300_000;
      const MAX_AGE = 2_592_000_000;

      afterEach(() => {
        vi.useRealTimers();
      });

      const eventAt = (occurred_at: number) => ({
        event_id: EVENT_ID,
        source: 'web',
        occurred_at,
        user_id: 'user123',
        device_id: 'device123',
        type: 'page_view',
        payload: { page_id: 'checkout' },
      });

      it('rejects occurred_at beyond the allowed clock skew', () => {
        vi.useFakeTimers({ now: NOW });

        const { success, error } = recordEventSchema.safeParse(
          eventAt(NOW + SKEW + 1),
        );

        expect(success).toBe(false);
        expect(error?.issues).toMatchObject([
          { code: 'custom', path: ['occurred_at'] },
        ]);
      });

      it('accepts occurred_at exactly at the allowed clock skew', () => {
        vi.useFakeTimers({ now: NOW });

        const { success } = recordEventSchema.safeParse(eventAt(NOW + SKEW));

        expect(success).toBe(true);
      });

      it('rejects occurred_at older than the allowed event age', () => {
        vi.useFakeTimers({ now: NOW });

        const { success, error } = recordEventSchema.safeParse(
          eventAt(NOW - MAX_AGE - 1),
        );

        expect(success).toBe(false);
        expect(error?.issues).toMatchObject([
          { code: 'custom', path: ['occurred_at'] },
        ]);
      });

      it('accepts occurred_at exactly at the allowed event age', () => {
        vi.useFakeTimers({ now: NOW });

        const { success } = recordEventSchema.safeParse(eventAt(NOW - MAX_AGE));

        expect(success).toBe(true);
      });
    });

    it('rejects camelCase keys instead of normalising them', () => {
      const camelCaseEvent = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        userId: 'user123',
        device_id: 'device123',
        type: 'page_view',
        payload: { page_id: 'checkout' },
      };

      const { success, error } = recordEventSchema.safeParse(camelCaseEvent);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        {
          code: 'unrecognized_keys',
          keys: ['userId'],
        },
      ]);
    });

    it('requires device_id for web and mobile events', () => {
      const webEventWithoutDeviceId = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        type: 'page_view',
        payload: {
          page_id: 'checkout',
        },
      };

      const { success, error } = recordEventSchema.safeParse(
        webEventWithoutDeviceId,
      );

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { code: 'custom', path: ['device_id'] },
      ]);
    });

    it.each([
      {
        type: 'error',
        payload: { code: 'unknown_code', operation: 'unknown_operation' },
      },
      {
        type: 'purchase',
        payload: {
          order_id: 'order123',
          channel: 'app',
          sum: 100,
          items: [{ id: 'item123', unit_price: 50, quantity: 2 }],
        },
      },
    ])('accepts a server $type event without device_id', (variant) => {
      const serverEventWithoutDeviceId = {
        event_id: EVENT_ID,
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        ...variant,
      };

      const { success, data } = recordEventSchema.safeParse(
        serverEventWithoutDeviceId,
      );

      expect(success).toBe(true);
      expect(data).toMatchObject(serverEventWithoutDeviceId);
      expect(data?.device_id).toBeUndefined();
    });
  });

  describe('purchase', () => {
    it.each(['web', 'mobile'])('rejects a purchase from %s', (source) => {
      const clientPurchase = {
        event_id: EVENT_ID,
        source,
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
          channel: 'app',
          sum: 100,
          items: [{ id: 'item123', unit_price: 50, quantity: 2 }],
        },
      };

      const { success, error } = recordEventSchema.safeParse(clientPurchase);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([{ path: ['source'] }]);
    });

    it('rejects a non-integer sum', () => {
      const fractionalSumPurchase = {
        event_id: EVENT_ID,
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
          channel: 'app',
          sum: 10.3,
          items: [{ id: 'item123', unit_price: 50, quantity: 2 }],
        },
      };

      const { success, error } = recordEventSchema.safeParse(
        fractionalSumPurchase,
      );

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { code: 'invalid_type', path: ['payload', 'sum'] },
      ]);
    });

    it('rejects a missing channel', () => {
      const noChannelPurchase = {
        event_id: EVENT_ID,
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
          sum: 100,
          items: [{ id: 'item123', unit_price: 50, quantity: 2 }],
        },
      };

      const { success, error } = recordEventSchema.safeParse(noChannelPurchase);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([{ path: ['payload', 'channel'] }]);
    });

    it('rejects an unknown channel', () => {
      const unknownChannelPurchase = {
        event_id: EVENT_ID,
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
          channel: 'kiosk',
          sum: 100,
          items: [{ id: 'item123', unit_price: 50, quantity: 2 }],
        },
      };

      const { success, error } = recordEventSchema.safeParse(
        unknownChannelPurchase,
      );

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { code: 'invalid_value', path: ['payload', 'channel'] },
      ]);
    });

    it('rejects a zero sum', () => {
      const zeroSumPurchase = {
        event_id: EVENT_ID,
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
          channel: 'app',
          sum: 0,
          items: [{ id: 'item123', unit_price: 50, quantity: 2 }],
        },
      };

      const { success, error } = recordEventSchema.safeParse(zeroSumPurchase);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { path: ['payload', 'sum'], code: 'too_small' },
      ]);
    });

    it('rejects an empty items array', () => {
      const emptyItemsPurchase = {
        event_id: EVENT_ID,
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
          channel: 'app',
          sum: 100,
          items: [],
        },
      };

      const { success, error } =
        recordEventSchema.safeParse(emptyItemsPurchase);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { code: 'too_small', origin: 'array', path: ['payload', 'items'] },
      ]);
    });

    it('rejects a zero quantity', () => {
      const zeroQuantityPurchase = {
        event_id: EVENT_ID,
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
          channel: 'app',
          sum: 100,
          items: [{ id: 'item123', unit_price: 50, quantity: 0 }],
        },
      };

      const { success, error } =
        recordEventSchema.safeParse(zeroQuantityPurchase);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { path: ['payload', 'items', 0, 'quantity'], code: 'too_small' },
      ]);
    });

    it('rejects a non-integer unit_price', () => {
      const fractionalUnitPricePurchase = {
        event_id: EVENT_ID,
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
          channel: 'app',
          sum: 100,
          items: [{ id: 'item123', unit_price: 50.5, quantity: 2 }],
        },
      };

      const { success, error } = recordEventSchema.safeParse(
        fractionalUnitPricePurchase,
      );

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { code: 'invalid_type', path: ['payload', 'items', 0, 'unit_price'] },
      ]);
    });
  });

  describe('length limits', () => {
    const base = {
      event_id: EVENT_ID,
      source: 'server',
      occurred_at: Date.now(),
      user_id: 'user123',
    };
    const purchase = (payload: object) => ({
      ...base,
      type: 'purchase',
      payload: {
        order_id: 'order123',
        channel: 'app',
        sum: 100,
        items: [{ id: 'item123', unit_price: 50, quantity: 2 }],
        ...payload,
      },
    });
    const pageView = (payload: object) => ({
      ...base,
      source: 'web',
      device_id: 'device123',
      type: 'page_view',
      payload: { page_id: 'home', ...payload },
    });
    const error = (payload: object) => ({
      ...base,
      type: 'error',
      payload: { operation: 'op', code: 'code', ...payload },
    });
    const items = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `item${i}`,
        unit_price: 50,
        quantity: 1,
      }));

    it.each([
      ['page_view page_id', pageView, 'page_id', 128],
      ['page_view entity_id', pageView, 'entity_id', 128],
      ['page_view referrer', pageView, 'referrer', 2048],
      ['page_view utm_source', pageView, 'utm_source', 128],
      ['page_view utm_medium', pageView, 'utm_medium', 128],
      ['page_view utm_campaign', pageView, 'utm_campaign', 128],
      ['purchase order_id', purchase, 'order_id', 128],
      ['error operation', error, 'operation', 64],
      ['error code', error, 'code', 64],
      ['error page_id', error, 'page_id', 128],
    ])(
      '%s: accepts the limit, rejects one more',
      (_name, build, field, max) => {
        const atLimit = recordEventSchema.safeParse(
          build({ [field]: 'x'.repeat(max) }),
        );
        const overLimit = recordEventSchema.safeParse(
          build({ [field]: 'x'.repeat(max + 1) }),
        );

        expect(atLimit.success).toBe(true);
        expect(overLimit.success).toBe(false);
        expect(overLimit.error?.issues).toMatchObject([
          { code: 'too_big', path: ['payload', field] },
        ]);
      },
    );

    it('rejects an item id longer than 128 characters', () => {
      const { success, error } = recordEventSchema.safeParse(
        purchase({
          items: [{ id: 'x'.repeat(129), unit_price: 50, quantity: 1 }],
        }),
      );

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { code: 'too_big', path: ['payload', 'items', 0, 'id'] },
      ]);
    });

    it('accepts a quantity of 100000 and rejects 100001', () => {
      const withQuantity = (quantity: number) =>
        purchase({ items: [{ id: 'item123', unit_price: 50, quantity }] });

      expect(recordEventSchema.safeParse(withQuantity(100_000)).success).toBe(
        true,
      );

      const { success, error } = recordEventSchema.safeParse(
        withQuantity(100_001),
      );

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { code: 'too_big', path: ['payload', 'items', 0, 'quantity'] },
      ]);
    });

    it('rejects a sum above the safe integer range', () => {
      const { success, error } = recordEventSchema.safeParse(
        purchase({ sum: Number.MAX_SAFE_INTEGER + 2 }),
      );

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([{ path: ['payload', 'sum'] }]);
    });

    it('accepts 100 items and rejects 101', () => {
      expect(
        recordEventSchema.safeParse(purchase({ items: items(100) })).success,
      ).toBe(true);

      const { success, error } = recordEventSchema.safeParse(
        purchase({ items: items(101) }),
      );

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { code: 'too_big', origin: 'array', path: ['payload', 'items'] },
      ]);
    });
  });

  describe('page_view', () => {
    it('requires entity_id for the category page', () => {
      const categoryPageView = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'page_view',
        payload: { page_id: 'category' },
      };

      const { success, error } = recordEventSchema.safeParse(categoryPageView);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { path: ['payload', 'entity_id'], code: 'custom' },
      ]);
    });

    it('requires entity_id for the item page', () => {
      const itemPageView = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'page_view',
        payload: { page_id: 'item' },
      };

      const { success, error } = recordEventSchema.safeParse(itemPageView);

      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { path: ['payload', 'entity_id'], code: 'custom' },
      ]);
    });

    it('does not require entity_id for the home page', () => {
      const homePageView = {
        event_id: EVENT_ID,
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'page_view',
        payload: { page_id: 'home' },
      };

      const { success, data } = recordEventSchema.safeParse(homePageView);

      expect(success).toBe(true);
      expect(data).toMatchObject(homePageView);
    });
  });
});
