import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventsRepository } from './events.repository.js';

@Module({
  imports: [DatabaseModule],
  controllers: [EventsController],
  providers: [EventsService, EventsRepository],
})
export class EventsModule {}
