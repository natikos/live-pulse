import { describe, it, expect } from 'vitest';
import { listEventsSchema } from './list-events.dto.js';
import { MIN_OCCURRED_AT_MS } from './timestamp.js';

const START = 1_767_225_600_000;

function encodeToBase64Url(payload: unknown) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

// The message is volatile, so only the code and the path are pinned.
function expectInvalidCursor(cursor: string) {
  const { success, error } = listEventsSchema.safeParse({ cursor });
  expect(success).toBe(false);
  expect(error?.issues).toMatchObject([{ code: 'custom', path: ['cursor'] }]);
}

describe('listEventsSchema', () => {
  describe('valid input', () => {
    it('accepts an empty query', () => {
      const { success, data } = listEventsSchema.safeParse({});

      expect(success).toBe(true);
      expect(data?.startDate).toBeUndefined();
      expect(data?.endDate).toBeUndefined();
    });

    it('defaults limit to 50', () => {
      expect(listEventsSchema.parse({}).limit).toBe(50);
    });

    it.each([
      ['1', 1],
      ['20', 20],
      ['100', 100],
    ])('converts limit string %j from the query string to %d', (raw, limit) => {
      expect(listEventsSchema.parse({ limit: raw }).limit).toBe(limit);
    });

    it('wraps a single type into an array', () => {
      const { success, data } = listEventsSchema.safeParse({ type: 'error' });

      expect(success).toBe(true);
      expect(data?.type).toEqual(['error']);
    });

    it('accepts several types', () => {
      const { success, data } = listEventsSchema.safeParse({
        type: ['page_view', 'purchase'],
      });

      expect(success).toBe(true);
      expect(data?.type).toEqual(['page_view', 'purchase']);
    });

    it('converts timestamp strings from the query string to Date', () => {
      const { success, data } = listEventsSchema.safeParse({
        startDate: String(START),
        endDate: String(START + 1),
      });

      expect(success).toBe(true);
      expect(data).toMatchObject({
        startDate: new Date(START),
        endDate: new Date(START + 1),
      });
    });

    it('accepts only one of the two dates', () => {
      expect(
        listEventsSchema.safeParse({ startDate: String(START) }).success,
      ).toBe(true);
      expect(
        listEventsSchema.safeParse({ endDate: String(START) }).success,
      ).toBe(true);
    });

    it('accepts startDate equal to endDate', () => {
      const result = listEventsSchema.safeParse({
        startDate: String(START),
        endDate: String(START),
      });

      expect(result.success).toBe(true);
    });
  });

  describe('invalid input', () => {
    it('rejects an unknown type', () => {
      expect(listEventsSchema.safeParse({ type: 'click' }).success).toBe(false);
    });

    it('rejects an unknown key', () => {
      expect(listEventsSchema.safeParse({ offset: '10' }).success).toBe(false);
    });

    it.each(['0', '-1', '101', '', 'abc', '1.5'])(
      'rejects limit=%j',
      (limit) => {
        expect(listEventsSchema.safeParse({ limit }).success).toBe(false);
      },
    );

    it('rejects a timestamp in seconds', () => {
      const result = listEventsSchema.safeParse({
        startDate: String(Math.floor(START / 1000)),
      });

      expect(result.success).toBe(false);
    });

    it('rejects an empty date instead of treating it as 0', () => {
      expect(listEventsSchema.safeParse({ startDate: '' }).success).toBe(false);
    });

    it('rejects a non-numeric date', () => {
      expect(
        listEventsSchema.safeParse({ endDate: '2026-01-01' }).success,
      ).toBe(false);
    });

    it('rejects a fractional timestamp', () => {
      expect(
        listEventsSchema.safeParse({ startDate: `${START}.5` }).success,
      ).toBe(false);
    });

    it('rejects startDate later than endDate and points at endDate', () => {
      const result = listEventsSchema.safeParse({
        startDate: String(START + 1),
        endDate: String(START),
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toMatchObject([
        { path: ['endDate'], message: expect.stringContaining('startDate') },
      ]);
    });

    it('does not report the range error when a date is already invalid', () => {
      const result = listEventsSchema.safeParse({
        startDate: String(START),
        endDate: '1',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toHaveLength(1);
      expect(result.error?.issues[0]?.path).toEqual(['endDate']);
    });
  });

  describe('cursor', () => {
    it('leaves cursor undefined when the query has none', () => {
      const { success, data } = listEventsSchema.safeParse({});
      expect(success).toBe(true);
      expect(data?.cursor).toBe(undefined);
    });

    it('decodes a valid token into occurredAt (Date) and id', () => {
      const cursorPayload = { occurredAt: START + 123, id: 2 };
      const cursor = encodeToBase64Url(cursorPayload);
      const data = listEventsSchema.parse({ cursor });
      expect(data.cursor?.occurredAt).toEqual(
        new Date(cursorPayload.occurredAt),
      );
      expect(data.cursor?.id).toBe(cursorPayload.id);
    });

    it('accepts the minimum occurredAt and id 1', () => {
      const cursorPayload = { occurredAt: MIN_OCCURRED_AT_MS, id: 1 };
      const cursor = encodeToBase64Url(cursorPayload);
      const data = listEventsSchema.parse({ cursor });
      expect(data.cursor?.occurredAt).toEqual(
        new Date(cursorPayload.occurredAt),
      );
      expect(data.cursor?.id).toBe(cursorPayload.id);
    });

    it.each([
      ['plus from standard base64', '+++123'],
      ['slash from standard base64', 'ab/c'],
      ['padding', 'abc='],
      ['whitespace', 'a b'],
      ['percent signs', '%%%'],
      ['a length that base64 cannot have', 'abcde'],
    ])('rejects a string that is not base64url: %s', (_label, cursor) => {
      const { success, error } = listEventsSchema.safeParse({ cursor });
      expect(success).toBe(false);
      expect(error?.issues).toMatchObject([
        { code: 'invalid_format', format: 'base64url', path: ['cursor'] },
      ]);
    });

    it('rejects valid base64url that is not JSON', () => {
      expectInvalidCursor(Buffer.from('not json').toString('base64url'));
    });

    it.each([
      ['null', null],
      ['an array', []],
      ['a number', 1],
      ['a string', 'x'],
      ['a boolean', true],
    ])('rejects JSON of the wrong type: %s', (_label, payload) => {
      expectInvalidCursor(encodeToBase64Url(payload));
    });

    it.each([
      ['id', { occurredAt: START }],
      ['occurredAt', { id: 1 }],
      ['both fields', {}],
    ])('rejects a token without %s', (_label, payload) => {
      expectInvalidCursor(encodeToBase64Url(payload));
    });

    it('rejects an extra field in the token', () => {
      expectInvalidCursor(
        encodeToBase64Url({ occurredAt: START, id: 1, extra: true }),
      );
    });

    it.each([
      ['zero', 0],
      ['negative', -1],
      ['fractional', 1.5],
      ['a string', '1'],
      ['null', null],
    ])('rejects id that is %s', (_label, id) => {
      expectInvalidCursor(encodeToBase64Url({ occurredAt: START, id }));
    });

    it.each([
      ['below the minimum', MIN_OCCURRED_AT_MS - 1],
      ['fractional', START + 0.5],
      ['a non-numeric string', 'abc'],
      ['an empty string', ''],
      ['null', null],
    ])('rejects occurredAt that is %s', (_label, occurredAt) => {
      expectInvalidCursor(encodeToBase64Url({ occurredAt, id: 1 }));
    });

    // An empty value is treated like a missing one, so `?cursor=` starts from
    // the first page instead of failing the request.
    it('treats an empty cursor as absent', () => {
      const data = listEventsSchema.parse({ cursor: '' });
      expect(data.cursor).toBeUndefined();
    });

    it('points the error at cursor and reports it only once', () => {
      const { error } = listEventsSchema.safeParse({
        cursor: encodeToBase64Url({ occurredAt: 'abc', id: 0 }),
      });
      expect(error?.issues).toHaveLength(1);
      expect(error?.issues[0]?.path).toEqual(['cursor']);
    });

    it('parses together with type, startDate, endDate and limit', () => {
      const data = listEventsSchema.parse({
        cursor: encodeToBase64Url({ occurredAt: START + 5, id: 7 }),
        type: 'error',
        startDate: String(START),
        endDate: String(START + 10),
        limit: '20',
      });
      expect(data).toMatchObject({
        type: ['error'],
        startDate: new Date(START),
        endDate: new Date(START + 10),
        limit: 20,
        cursor: { occurredAt: new Date(START + 5), id: 7 },
      });
    });

    it('reports a bad cursor and a bad date at the same time', () => {
      const { error } = listEventsSchema.safeParse({
        cursor: Buffer.from('not json').toString('base64url'),
        startDate: 'abc',
      });
      expect(error?.issues.map((issue) => issue.path.join('.')).sort()).toEqual(
        ['cursor', 'startDate'],
      );
    });

    it('round-trips occurredAt with non-zero milliseconds through encode', () => {
      const occurredAt = START + 999;
      const data = listEventsSchema.parse({
        cursor: encodeToBase64Url({ occurredAt, id: 1 }),
      });
      expect(data.cursor?.occurredAt.getTime()).toBe(occurredAt);
    });
  });
});
