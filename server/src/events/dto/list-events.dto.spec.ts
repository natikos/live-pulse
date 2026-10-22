import { describe, it, expect, vi } from 'vitest';
import { listEventsSchema } from './list-events.dto.js';

// list-events.dto imports a constant from record-event.dto, which reads config.
vi.mock('../../config.js', () => ({
  config: { maxClockSkewMs: 300_000, maxEventAgeMs: 2_592_000_000 },
}));

const START = 1_767_225_600_000;

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
});
