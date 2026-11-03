import z from 'zod';

// Schemas shared by more than one endpoint. Endpoint-specific rules stay in
// that endpoint's DTO file.

export const MAX_ID_LENGTH = 128;
const MAX_CODE_LENGTH = 64;
const MAX_URL_LENGTH = 2048;
const MAX_UTM_LENGTH = 128;
const MAX_ITEMS = 100;
const MAX_QUANTITY = 100_000;

export const eventSource = z.enum(['web', 'mobile', 'server']);
export const eventType = z.enum(['page_view', 'purchase', 'error']);

export const pageViewPayload = z.strictObject({
  // Open vocabulary: unknown pages are accepted (EVENT_CONTRACT.md).
  page_id: z.string().min(1).max(MAX_ID_LENGTH),
  entity_id: z.string().min(1).max(MAX_ID_LENGTH).optional(),
  referrer: z.string().max(MAX_URL_LENGTH).optional(),
  utm_source: z.string().max(MAX_UTM_LENGTH).optional(),
  utm_medium: z.string().max(MAX_UTM_LENGTH).optional(),
  utm_campaign: z.string().max(MAX_UTM_LENGTH).optional(),
});

export const purchasePayload = z.strictObject({
  order_id: z.string().min(1).max(MAX_ID_LENGTH),
  channel: z.enum(['app', 'phone', 'admin']),
  sum: z.int().positive(),
  items: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(MAX_ID_LENGTH),
        unit_price: z.int().positive(),
        quantity: z.int().positive().max(MAX_QUANTITY),
      }),
    )
    .nonempty()
    .max(MAX_ITEMS),
});

export const errorPayload = z.strictObject({
  operation: z.string().min(1).max(MAX_CODE_LENGTH),
  code: z.string().min(1).max(MAX_CODE_LENGTH),
  page_id: z.string().min(1).max(MAX_ID_LENGTH).optional(),
});
