import { BadRequestException, Injectable } from '@nestjs/common';
import { Kysely, Selectable, SelectQueryBuilder, sql, SqlBool } from 'kysely';
import { DatabaseService } from '../database/database.service.js';
import { Database, EventsTable } from '../database/schema.js';
import { EventModel, EventsFilter, NewEventsFilter } from './event.model.js';

const EVENT_COLUMNS = [
  'id',
  'event_id',
  'type',
  'source',
  'user_id',
  'device_id',
  'payload',
  'occurred_at',
] as const;

export type EventRow = Pick<
  Selectable<EventsTable>,
  (typeof EVENT_COLUMNS)[number]
>;

export interface EventsPage {
  rows: EventRow[];
  // Only the first page (no cursor) carries one; see getEvents.
  snapshot: string | null;
}

@Injectable()
export class EventsRepository {
  constructor(private readonly db: DatabaseService) {}

  // The first page also returns the pg_snapshot the rows were read under. In
  // REPEATABLE READ the whole transaction shares one snapshot, so the rows and
  // the token describe the same moment, also when the page is empty. Later
  // pages return none: the reader keeps the first one.
  async getEvents(filter: EventsFilter): Promise<EventsPage> {
    if (filter.cursor) {
      return { rows: await this.selectPage(this.db, filter), snapshot: null };
    }

    return this.db
      .transaction()
      .setIsolationLevel('repeatable read')
      .setAccessMode('read only')
      .execute(async (trx) => {
        const rows = await this.selectPage(trx, filter);
        const { rows: snapshots } = await sql<{ snapshot: string }>`
          SELECT pg_current_snapshot()::text AS snapshot
        `.execute(trx);
        return { rows, snapshot: snapshots[0]!.snapshot };
      });
  }

  private selectPage(
    db: Kysely<Database>,
    filter: EventsFilter,
  ): Promise<EventRow[]> {
    const { limit, cursor } = filter;
    let query = this.applyFilters(
      db.selectFrom('events').select(EVENT_COLUMNS),
      filter,
    );

    if (cursor) {
      query = query.where((eb) =>
        eb(
          eb.refTuple('occurred_at', 'id'),
          '<',
          eb.tuple(cursor.occurredAt, cursor.id),
        ),
      );
    }

    return query
      .limit(limit)
      .orderBy('occurred_at', 'desc')
      .orderBy('id', 'desc')
      .execute();
  }

  async hasNewEvents(filter: NewEventsFilter): Promise<boolean> {
    const { snapshot } = filter;
    const query = this.applyFilters(
      this.db.selectFrom('events').select('id'),
      filter,
    )
      .where(
        sql<SqlBool>`insert_xid >= pg_snapshot_xmin(${snapshot}::pg_snapshot)::text::bigint`,
      )
      .where(
        sql<SqlBool>`NOT pg_visible_in_snapshot(insert_xid::text::xid8, ${snapshot}::pg_snapshot)`,
      )
      .limit(1);

    try {
      return (await query.executeTakeFirst()) !== undefined;
    } catch (error) {
      // 22P02: the token has the right shape but is not a valid snapshot.
      if (error instanceof Error && 'code' in error && error.code === '22P02') {
        throw new BadRequestException(['snapshot: not a valid snapshot']);
      }
      throw error;
    }
  }

  private applyFilters<O>(
    query: SelectQueryBuilder<Database, 'events', O>,
    { types, from, to }: Pick<EventsFilter, 'types' | 'from' | 'to'>,
  ): SelectQueryBuilder<Database, 'events', O> {
    if (types?.length) {
      query = query.where('type', 'in', types);
    }
    if (from) {
      query = query.where('occurred_at', '>=', from);
    }
    if (to) {
      query = query.where('occurred_at', '<=', to);
    }
    return query;
  }

  async insertEvent(event: EventModel) {
    return this.db
      .insertInto('events')
      .values(event)
      .onConflict((oc) => oc.column('event_id').doNothing())
      .execute();
  }
}
