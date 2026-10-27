import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { EventModel, EventsFilter } from './event.model.js';

@Injectable()
export class EventsRepository {
  constructor(private readonly db: DatabaseService) {}

  async getEvents(filter: EventsFilter) {
    const { types, from, to, limit } = filter;
    let query = this.db
      .selectFrom('events')
      .select([
        'event_id',
        'type',
        'source',
        'user_id',
        'device_id',
        'payload',
        'occurred_at',
      ]);

    if (types?.length) {
      query = query.where('type', 'in', types);
    }
    if (from) {
      query = query.where('occurred_at', '>=', from);
    }
    if (to) {
      query = query.where('occurred_at', '<=', to);
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
