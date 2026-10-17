import { Body, Controller, Post } from '@nestjs/common';
import { EventsService } from './events.service.js';
import {
  recordEventSchema,
  type RecordEventDto,
} from './dto/record-event.dto.js';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async recordEvent(@Body({ schema: recordEventSchema }) body: RecordEventDto) {
    return this.eventsService.recordEvent(body);
  }
}
