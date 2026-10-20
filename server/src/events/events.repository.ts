import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { EventModel } from './event.model.js';

@Injectable()
export class EventsRepository {
  constructor(private readonly db: DatabaseService) {}

  async getEvents() {
    return this.db
      .selectFrom('events')
      .selectAll()
      .limit(10)
      .orderBy('created_at', 'desc')
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
