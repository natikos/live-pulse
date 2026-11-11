import { Injectable } from '@nestjs/common';
import { Selectable } from 'kysely';
import { DatabaseService } from '../database/database.service.js';
import { EventsTable } from '../database/schema.js';
import { EventModel, EventsFilter } from './event.model.js';

const EVENT_COLUMNS = [
  'id',
  'event_id',
  'type',
  'source',
  'user_id',
  'device_id',
  'payload',
  'occurred_at',
] as const;

export type EventRow = Pick<
  Selectable<EventsTable>,
  (typeof EVENT_COLUMNS)[number]
>;

@Injectable()
export class EventsRepository {
  constructor(private readonly db: DatabaseService) {}

  async getEvents(filter: EventsFilter): Promise<EventRow[]> {
    const { types, from, to, limit, cursor } = filter;
    let query = this.db.selectFrom('events').select(EVENT_COLUMNS);

    if (types?.length) {
      query = query.where('type', 'in', types);
    }
    if (from) {
      query = query.where('occurred_at', '>=', from);
    }
    if (to) {
      query = query.where('occurred_at', '<=', to);
    }
    if (cursor) {
      query = query.where((eb) =>
        eb(
          eb.refTuple('occurred_at', 'id'),
          '<',
          eb.tuple(cursor.occurredAt, cursor.id),
        ),
      );
    }

    return query
      .limit(limit)
      .orderBy('occurred_at', 'desc')
      .orderBy('id', 'desc')
      .execute();
  }

  async insertEvent(event: EventModel) {
    return this.db
      .insertInto('events')
      .values(event)
      .onConflict((oc) => oc.column('event_id').doNothing())
      .execute();
  }
}
