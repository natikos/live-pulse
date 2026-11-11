import z from 'zod';

// The body Nest sends for a rejected request.
export const badRequestResponseSchema = z
  .object({
    statusCode: z.literal(400),
    error: z.literal('Bad Request'),
    message: z.array(z.string()).meta({
      description: 'Each problem as "field: reason".',
      example: ['limit: Too big: expected number to be <=100'],
    }),
  })
  .meta({ id: 'BadRequestError' });
