import { describe, it, expect } from 'vitest';
import { newEventsQuerySchema } from './new-events.dto.js';

const START = 1_767_225_600_000;

describe('newEventsQuerySchema', () => {
  describe('snapshot', () => {
    it.each([
      ['1705:1708:1706,1707', 'with several in-flight transactions'],
      ['1705:1708:1706', 'with one in-flight transaction'],
      ['1705:1705:', 'with none in flight'],
    ])('accepts %j (%s)', (snapshot) => {
      expect(newEventsQuerySchema.safeParse({ snapshot }).success).toBe(true);
    });

    it('is required', () => {
      expect(newEventsQuerySchema.safeParse({}).success).toBe(false);
    });

    it.each([
      '',
      'abc',
      '1705',
      '1705:1708',
      '1705:1708:1706,',
      '1705:1708:,1706',
      '-1:1708:',
      '1705:1708:1706;DROP TABLE events',
      ' 1705:1708:',
    ])('rejects %j', (snapshot) => {
      expect(newEventsQuerySchema.safeParse({ snapshot }).success).toBe(false);
    });
  });

  describe('filters', () => {
    it('accepts the same filters as the list', () => {
      const { success, data } = newEventsQuerySchema.safeParse({
        snapshot: '1705:1708:',
        type: 'purchase',
        startDate: String(START),
        endDate: String(START + 1),
      });

      expect(success).toBe(true);
      expect(data).toMatchObject({
        type: ['purchase'],
        startDate: new Date(START),
        endDate: new Date(START + 1),
      });
    });

    it('rejects startDate after endDate', () => {
      const result = newEventsQuerySchema.safeParse({
        snapshot: '1705:1708:',
        startDate: String(START + 1),
        endDate: String(START),
      });

      expect(result.success).toBe(false);
    });

    it('rejects an unknown key', () => {
      const result = newEventsQuerySchema.safeParse({
        snapshot: '1705:1708:',
        limit: '10',
      });

      expect(result.success).toBe(false);
    });
  });
});
