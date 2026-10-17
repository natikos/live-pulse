import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { EventModel } from './event.model.js';

@Injectable()
export class EventsRepository {
  constructor(private readonly db: DatabaseService) {}

  async insertEvent(event: EventModel) {
    return this.db.insertInto('events').values(event).execute();
  }
}
