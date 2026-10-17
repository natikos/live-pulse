import z from 'zod';
import { PageId } from '../event.model.js';

const PAGES_NEED_ENTITY_ID: ReadonlySet<string> = new Set([
  'category',
  'item',
] satisfies PageId[]);

const envelope = {
  source: z.enum(['web', 'mobile', 'server']),
  // Unix time in milliseconds. The lower bound rejects seconds: 1e12 ms is 2001-09-09,
  // while the same instant in seconds is ~1e9, far below the bound.
  occurred_at: z.int().min(1_000_000_000_000),
  user_id: z.string().min(1).optional(),
  device_id: z.string().min(1).optional(),
};

const pageViewEvent = z.strictObject({
  ...envelope,
  type: z.literal('page_view'),
  payload: z.strictObject({
    // Open vocabulary: unknown pages are accepted (EVENT_CONTRACT.md).
    page_id: z.string().min(1),
    entity_id: z.string().min(1).optional(),
    referrer: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
  }),
});

const purchaseEvent = z.strictObject({
  ...envelope,
  type: z.literal('purchase'),
  payload: z.strictObject({
    order_id: z.string().min(1),
    sum: z.int().positive(),
    items: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          unit_price: z.int().positive(),
          quantity: z.int().positive(),
        }),
      )
      .nonempty(),
  }),
});

const errorEvent = z.strictObject({
  ...envelope,
  type: z.literal('error'),
  payload: z.strictObject({
    operation: z.string().min(1),
    code: z.string().min(1),
    page_id: z.string().min(1).optional(),
  }),
});

export const recordEventSchema = z
  .discriminatedUnion('type', [pageViewEvent, purchaseEvent, errorEvent])
  .superRefine((event, ctx) => {
    if (event.source !== 'server' && event.device_id === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['device_id'],
        message: 'device_id is required for web and mobile events',
      });
    }

    if (
      event.type === 'page_view' &&
      PAGES_NEED_ENTITY_ID.has(event.payload.page_id)
    ) {
      if (event.payload.entity_id === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['payload', 'entity_id'],
          message: `entity_id is required for page_id "${event.payload.page_id}"`,
        });
      }
    }
  });

export type RecordEventDto = z.infer<typeof recordEventSchema>;
