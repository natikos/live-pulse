import z from 'zod';
import { eventFilterShape, rejectReversedDates } from './list-events.dto.js';

// Text form of pg_snapshot: xmin:xmax:xip_list, e.g. "1705:1708:1706,1707".
// Only the shape is checked here; Postgres rejects an inconsistent snapshot.
const SNAPSHOT_PATTERN = /^\d+:\d+:(\d+(,\d+)*)?$/;

export const newEventsQuerySchema = z
  .strictObject({
    ...eventFilterShape,
    snapshot: z.string().regex(SNAPSHOT_PATTERN).meta({
      description:
        'Opaque token of the list the reader is looking at. Send it back unchanged.',
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
});

export type NewEventsResponseDto = z.infer<typeof newEventsResponseSchema>;
