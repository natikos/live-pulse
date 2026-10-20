import { randomUUID } from 'node:crypto';

// Fresh event_id and occurred_at on every call, so events never collide or go stale.
export function validPageView(overrides: Record<string, unknown> = {}) {
  return {
    event_id: randomUUID(),
    type: 'page_view',
    source: 'web',
    occurred_at: Date.now(),
    device_id: 'device-1',
    payload: { page_id: 'home' },
    ...overrides,
  };
}
