import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { EventsService } from './events.service.js';
import {
  recordEventSchema,
  recordEventResponseSchema,
  type RecordEventDto,
  type RecordEventResponseDto,
} from './dto/record-event.dto.js';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';
import {
  type ListEventsQueryDto,
  listEventsSchema,
} from './dto/list-events.dto.js';
import { listEventsResponseSchema } from './dto/list-events.response.dto.js';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  @ApiOperation({
    summary: 'List events',
    description:
      'Filters are optional and combined with AND. `type` may be repeated ' +
      '(`?type=error&type=purchase`). `startDate` and `endDate` are Unix time in ' +
      'milliseconds, inclusive; `startDate` must not be later than `endDate`. ' +
      'Events are returned newest first by `occurred_at`; `limit` caps how many ' +
      '(1-100, default 50). Unknown query keys are rejected.',
  })
  @ApiOkResponse({
    description: 'The matching events.',
    standardSchema: listEventsResponseSchema,
  })
  @ApiBadRequestResponse({
    description:
      'The query is invalid. `message` lists each problem as "field: reason".',
  })
  async listEvents(
    @Query({ schema: listEventsSchema }) query: ListEventsQueryDto,
  ) {
    return this.eventsService.getEvents(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Record an event',
    description:
      'Idempotent by `event_id`: the first event wins, a repeat is not stored again. ' +
      '`device_id` is required for `web` and `mobile` events. ' +
      '`purchase` is accepted from `server` only. Unknown keys are rejected.',
  })
  @ApiCreatedResponse({
    description: 'The event was stored.',
    standardSchema: recordEventResponseSchema,
  })
  @ApiOkResponse({
    description:
      'An event with this `event_id` already exists; nothing was stored.',
    standardSchema: recordEventResponseSchema,
  })
  @ApiBadRequestResponse({
    description:
      'The event is invalid. `message` lists each problem as "field: reason"; nothing was stored.',
  })
  async recordEvent(
    @Body({ schema: recordEventSchema }) body: RecordEventDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RecordEventResponseDto> {
    const result = await this.eventsService.recordEvent(body);
    if (!result.isNew) {
      response.status(HttpStatus.OK);
      return { status: 'duplicate' };
    }
    return { status: 'created' };
  }
}
