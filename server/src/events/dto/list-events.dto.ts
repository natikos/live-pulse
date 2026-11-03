import z from 'zod';
import {
  errorPayload,
  eventSource,
  eventType,
  pageViewPayload,
  purchasePayload,
} from './event-payloads.js';
import { cursorCodec } from './cursor.js';
import { MIN_OCCURRED_AT_MS } from './timestamp.js';

// Query values arrive as strings; an empty string would coerce to 0, which the
// lower bound rejects.
const timestampMs = z.coerce
  .number()
  .int()
  .min(MIN_OCCURRED_AT_MS)
  .transform((ms) => new Date(ms));

export const listEventsQuerySchema = z
  .strictObject({
    type: z.preprocess((value) => {
      if (value && !Array.isArray(value)) {
        return [value];
      }
      return value;
    }, z.array(eventType).optional()),
    startDate: timestampMs.optional().meta({
      description: 'Unix time in milliseconds, inclusive.',
    }),
    endDate: timestampMs.optional().meta({
      description: 'Unix time in milliseconds, inclusive.',
    }),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    // `?cursor=` is treated as absent, so it starts from the first page.
    cursor: z.preprocess(
      (value) => (value === '' ? undefined : value),
      cursorCodec.optional(),
    ),
  })
  .superRefine((query, ctx) => {
    // A value below the minimum already failed the range check, so the
    // transform did not run and it is still a number. Compare only the
    // converted dates to avoid a second error.
    const { startDate, endDate } = query;
    if (
      startDate instanceof Date &&
      endDate instanceof Date &&
      startDate > endDate
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'endDate must not be earlier than startDate',
      });
    }
  });

export type ListEventsQueryDto = z.infer<typeof listEventsQuerySchema>;

// What the API returns, not what the table stores: no internal id and no
// created_at. Dates are ISO strings because that is how a Date is serialised.
const responseEnvelope = {
  event_id: z.uuid(),
  source: eventSource,
  occurred_at: z.iso.datetime().meta({
    description: 'ISO 8601, UTC.',
    example: '2026-10-20T12:00:00.000Z',
  }),
  user_id: z.string().nullable(),
  device_id: z.string().nullable(),
};

export const listEventsItemSchema = z.discriminatedUnion('type', [
  z.object({
    ...responseEnvelope,
    type: z.literal('page_view'),
    payload: pageViewPayload,
  }),
  z.object({
    ...responseEnvelope,
    type: z.literal('purchase'),
    payload: purchasePayload,
  }),
  z.object({
    ...responseEnvelope,
    type: z.literal('error'),
    payload: errorPayload,
  }),
]);

export type ListEventsItemDto = z.infer<typeof listEventsItemSchema>;

export const listEventsResponseSchema = z.object({
  items: z.array(listEventsItemSchema).meta({
    description: 'Newest first by `occurred_at`, at most `limit` items.',
  }),
  nextCursor: z.string().nullable().meta({
    description:
      'Opaque. Pass as `cursor` to get the next page; `null` when there are no more events.',
  }),
});

export type ListEventsResponseDto = z.infer<typeof listEventsResponseSchema>;
