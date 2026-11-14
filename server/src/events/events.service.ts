import { Injectable } from '@nestjs/common';
import { RecordEventDto } from './dto/record-event.dto.js';
import { EventModel, EventsFilter } from './event.model.js';
import { EventsRepository } from './events.repository.js';
import {
  ListEventsQueryDto,
  ListEventsResponseDto,
} from './dto/list-events.dto.js';
import {
  NewEventsQueryDto,
  NewEventsResponseDto,
} from './dto/new-events.dto.js';
import { cursorCodec } from './dto/cursor.js';
import { toEventItem } from './events.mapper.js';

@Injectable()
export class EventsService {
  constructor(private readonly repository: EventsRepository) {}

  async getEvents(query: ListEventsQueryDto): Promise<ListEventsResponseDto> {
    const { type, startDate, endDate, limit, cursor } = query;

    const filter: EventsFilter = {
      types: type,
      from: startDate,
      to: endDate,
      // One row past the page tells whether another page exists without a
      // COUNT. It is never returned and never used for the cursor.
      limit: limit + 1,
      cursor,
    };

    const { rows, snapshot } = await this.repository.getEvents(filter);
    const items = rows.slice(0, limit);
    const last = items.at(-1);

    const nextCursor =
      rows.length > limit && last
        ? cursorCodec.encode({ occurredAt: last.occurred_at, id: last.id })
        : null;

    return { items: items.map(toEventItem), nextCursor, snapshot };
  }

  async hasNewEvents(query: NewEventsQueryDto): Promise<NewEventsResponseDto> {
    const { type, startDate, endDate, snapshot } = query;

    const hasNew = await this.repository.hasNewEvents({
      types: type,
      from: startDate,
      to: endDate,
      snapshot,
    });

    return { hasNew };
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
