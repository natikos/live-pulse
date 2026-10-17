import { describe, it, expect } from 'vitest';
import { recordEventSchema, type RecordEventDto } from './record-event.dto.js';

// Rules come from docs/EVENT_CONTRACT.md (DRAFT).
describe('recordEventSchema', () => {
  describe('valid input', () => {
    it('accepts a valid mobile purchase', () => {
      const validMobilePurchase: RecordEventDto = {
        source: 'mobile',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
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
      const validationResult = recordEventSchema.safeParse(validMobilePurchase);
      expect(validationResult.success).toBe(true);
    });

    it('accepts a page view with an unknown page_id', () => {
      const unknownPageView: RecordEventDto = {
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

    it('rejects occurred_at in seconds', () => {
      const secondsEvent = {
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

    it('rejects camelCase keys instead of normalising them', () => {
      const camelCaseEvent = {
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

    it('accepts a server event without device_id', () => {
      const serverEventWithoutDeviceId = {
        source: 'server',
        occurred_at: Date.now(),
        user_id: 'user123',
        type: 'error',
        payload: {
          code: 'unknown_code',
          operation: 'unknown_operation',
        },
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
    it('rejects a non-integer sum', () => {
      const fractionalSumPurchase = {
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
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

    it('rejects a zero sum', () => {
      const zeroSumPurchase = {
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
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
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
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
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
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
        source: 'web',
        occurred_at: Date.now(),
        user_id: 'user123',
        device_id: 'device123',
        type: 'purchase',
        payload: {
          order_id: 'order123',
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

  describe('page_view', () => {
    it('requires entity_id for the category page', () => {
      const categoryPageView = {
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
