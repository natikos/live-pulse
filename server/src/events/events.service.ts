import { Injectable } from '@nestjs/common';
import { RecordEventDto } from './dto/record-event.dto.js';
import { EventModel } from './event.model.js';
import { EventsRepository } from './events.repository.js';

@Injectable()
export class EventsService {
  constructor(private readonly repository: EventsRepository) {}

  async getEvents() {
    return this.repository.getEvents();
  }

  async recordEvent(body: RecordEventDto) {
    const { occurred_at, ...rest } = body;

    const event: EventModel = {
      ...rest,
      occurred_at: new Date(occurred_at),
    };

    const result = await this.repository.insertEvent(event);
    return { isNew: (result[0].numInsertedOrUpdatedRows ?? 0) > 0 };
  }
}
