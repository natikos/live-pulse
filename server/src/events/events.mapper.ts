import { ListEventsItemDto } from './dto/list-events.dto.js';
import { EventRow } from './events.repository.js';

// Distributes over the union, so each variant keeps its own type and payload.
type TypedPayload = ListEventsItemDto extends infer Item
  ? Item extends ListEventsItemDto
    ? Pick<Item, 'type' | 'payload'>
    : never
  : never;

// Fields are listed one by one, so a column reaches the client only after it
// is added to the response DTO.
export function toEventItem(row: EventRow): ListEventsItemDto {
  return {
    event_id: row.event_id,
    source: row.source,
    occurred_at: row.occurred_at.toISOString(),
    user_id: row.user_id,
    device_id: row.device_id,
    // Kysely types type and payload as separate columns. They match because
    // every write goes through recordEventSchema.
    ...({ type: row.type, payload: row.payload } as TypedPayload),
  };
}
