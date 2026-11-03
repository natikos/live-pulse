import { describe, it, expect } from 'vitest';
import { toEventItem } from './events.mapper.js';
import { EventRow } from './events.repository.js';

const row: EventRow = {
  id: 42,
  event_id: '0b6f6f0e-5a52-4c5e-9f3a-2f1f7f6a8d11',
  type: 'error',
  source: 'web',
  user_id: null,
  device_id: 'device-1',
  payload: { operation: 'create_order', code: 'timeout' },
  occurred_at: new Date('2026-10-20T12:00:00.123Z'),
};

describe('toEventItem', () => {
  it('does not expose the internal id', () => {
    expect(toEventItem(row)).not.toHaveProperty('id');
  });

  it('serialises occurred_at as ISO 8601 with milliseconds', () => {
    expect(toEventItem(row).occurred_at).toBe('2026-10-20T12:00:00.123Z');
  });

  it('keeps type and payload together', () => {
    expect(toEventItem(row)).toMatchObject({
      type: 'error',
      payload: { operation: 'create_order', code: 'timeout' },
    });
  });
});
