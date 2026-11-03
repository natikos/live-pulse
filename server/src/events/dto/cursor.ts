import z from 'zod';
import { MIN_OCCURRED_AT_MS } from './timestamp.js';

// What travels inside the token. occurredAt is a number because JSON has no
// dates, and JSON.stringify would turn a Date into an ISO string.
const cursorPayload = z.strictObject({
  occurredAt: z.int().min(MIN_OCCURRED_AT_MS),
  id: z.int().min(1),
});

const cursorValue = z.strictObject({
  occurredAt: z.date(),
  id: z.int().min(1),
});

export type Cursor = z.infer<typeof cursorValue>;

// The token format lives only here: decode for the query, encode for the
// response, so the two directions cannot drift apart.
export const cursorCodec = z.codec(z.base64url(), cursorValue, {
  decode: (token, payload) => {
    try {
      const json: unknown = JSON.parse(
        Buffer.from(token, 'base64url').toString('utf8'),
      );
      const { occurredAt, id } = cursorPayload.parse(json);
      return { occurredAt: new Date(occurredAt), id };
    } catch {
      payload.issues.push({
        code: 'custom',
        message: 'cursor is invalid',
        input: token,
      });
      return z.NEVER;
    }
  },
  encode: ({ occurredAt, id }) =>
    Buffer.from(
      JSON.stringify({ occurredAt: occurredAt.getTime(), id }),
    ).toString('base64url'),
});
