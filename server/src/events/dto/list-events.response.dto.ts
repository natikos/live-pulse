import z from 'zod';
import {
  errorPayload,
  pageViewPayload,
  purchasePayload,
} from './record-event.dto.js';

// What the API returns, not what the table stores: no internal id and no
// created_at. Dates are ISO strings because that is how a Date is serialised.
const responseEnvelope = {
  event_id: z.uuid(),
  source: z.enum(['web', 'mobile', 'server']),
  occurred_at: z.iso.datetime().meta({
    description: 'ISO 8601, UTC.',
    example: '2026-10-20T12:00:00.000Z',
  }),
  user_id: z.string().nullable(),
  device_id: z.string().nullable(),
};

export const listEventsResponseSchema = z
  .array(
    z.discriminatedUnion('type', [
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
    ]),
  )
  .meta({
    description: 'Newest first by `occurred_at`, at most `limit` items.',
  });

export type ListEventsResponseDto = z.infer<typeof listEventsResponseSchema>;
