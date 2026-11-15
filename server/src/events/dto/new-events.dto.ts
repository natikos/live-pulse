import z from 'zod';
import { eventFilterShape, rejectReversedDates } from './list-events.dto.js';

// Text form of pg_snapshot: xmin:xmax:xip_list, e.g. "1705:1708:1706,1707".
// Only the shape is checked here; Postgres rejects an inconsistent snapshot.
const SNAPSHOT_PATTERN = /^\d+:\d+:(\d+(,\d+)*)?$/;

const snapshotSchema = z.string().regex(SNAPSHOT_PATTERN);

export const newEventsQuerySchema = z
  .strictObject({
    ...eventFilterShape,
    snapshot: snapshotSchema.meta({
      description:
        'Opaque token of what the reader has already seen: the one from the first page, or the one from the last `has-new` answer the reader acknowledged. Send it back unchanged.',
      example: '1705:1708:1706,1707',
    }),
  })
  .superRefine(rejectReversedDates);

export type NewEventsQueryDto = z.infer<typeof newEventsQuerySchema>;

export const newEventsResponseSchema = z.object({
  hasNew: z.boolean().meta({
    description:
      'True when events matching the filters arrived after the list was loaded.',
  }),
  snapshot: snapshotSchema.meta({
    description:
      'Opaque token taken at the moment of this check. Replace the stored one with it only when the reader acknowledges the notice; adopting it earlier hides events that arrived in between.',
    example: '1705:1708:1706,1707',
  }),
});

export type NewEventsResponseDto = z.infer<typeof newEventsResponseSchema>;
