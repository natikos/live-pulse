import { describe, it, expect } from 'vitest';
import { cursorCodec } from './cursor.js';
import { listEventsQuerySchema } from './list-events.dto.js';

const START = 1_767_225_600_000;

describe('cursorCodec', () => {
  it('decodes what it encodes', () => {
    const cursor = { occurredAt: new Date(START + 123), id: 42 };
    expect(cursorCodec.decode(cursorCodec.encode(cursor))).toEqual(cursor);
  });

  it('produces a token the list query accepts', () => {
    const cursor = { occurredAt: new Date(START), id: 1 };
    const query = listEventsQuerySchema.parse({
      cursor: cursorCodec.encode(cursor),
    });
    expect(query.cursor).toEqual(cursor);
  });
});
