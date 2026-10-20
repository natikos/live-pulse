import { Body, Controller, Get, HttpStatus, Post, Res } from '@nestjs/common';
import { EventsService } from './events.service.js';
import {
  recordEventSchema,
  type RecordEventDto,
} from './dto/record-event.dto.js';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async getEvents() {
    return this.eventsService.getEvents();
  }

  @Post()
  @ApiOperation({
    summary: 'Record an event',
    description:
      'Idempotent by `event_id`: the first event wins, a repeat is not stored again. ' +
      '`device_id` is required for `web` and `mobile` events. ' +
      '`purchase` is accepted from `server` only. Unknown keys are rejected.',
  })
  @ApiCreatedResponse({ description: 'The event was stored.' })
  @ApiOkResponse({
    description:
      'An event with this `event_id` already exists; nothing was stored.',
  })
  @ApiBadRequestResponse({
    description:
      'The event is invalid. `message` lists each problem as "field: reason"; nothing was stored.',
  })
  async recordEvent(
    @Body({ schema: recordEventSchema }) body: RecordEventDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.eventsService.recordEvent(body);
    if (!result.isNew) {
      response.status(HttpStatus.OK);
      return { status: 'duplicate' };
    }
    return { status: 'created' };
  }
}
