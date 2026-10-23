import { Generated } from 'kysely';
import { EventModel } from '../events/event.model.js';

export interface Database {
  events: EventsTable;
}

export interface EventsTable {
  id: Generated<number>;
  event_id: string;
  type: EventModel['type'];
  payload: EventModel['payload'];
  source: EventModel['source'];
  user_id: string | null;
  device_id: string | null;
  created_at: Generated<Date>;
  occurred_at: Date;
  // Temporary: millisecond-precision replacement for occurred_at, nullable until backfilled.
  occurred_at_ms: Date | null;
}
