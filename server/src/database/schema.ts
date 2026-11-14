import { ColumnType, Generated } from 'kysely';
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
  // xid8 is a string in pg. Set by the DB; NULL for rows from before 0005.
  insert_xid: ColumnType<string | null, never, never>;
  created_at: Generated<Date>;
  occurred_at: Date;
}
