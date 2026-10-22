import { Injectable } from '@nestjs/common';
import { RecordEventDto } from './dto/record-event.dto.js';
import { EventModel, EventsFilter } from './event.model.js';
import { EventsRepository } from './events.repository.js';
import { ListEventsQueryDto } from './dto/list-events.dto.js';

@Injectable()
export class EventsService {
  constructor(private readonly repository: EventsRepository) {}

  async getEvents(query: ListEventsQueryDto) {
    const { type, startDate, endDate, limit } = query;

    const filter: EventsFilter = {
      types: type,
      from: startDate,
      to: endDate,
      limit,
    };

    return this.repository.getEvents(filter);
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
