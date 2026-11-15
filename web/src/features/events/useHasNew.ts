import { client } from '@/api/client';
import { ApiError, shouldRetry } from '@/api/errors';
import { skipToken, useQuery } from '@tanstack/react-query';
import type { EventFiltersValue } from './EventFilters';
import { toFilterQuery } from './filterQuery';

const POLL_INTERVAL_MS = 60_000;

// The token is in the key on purpose: when the reader acknowledges the notice
// the key changes, the old answer disappears with the notice, the new key is
// checked at once, and a response still in flight for the old token lands in
// an entry nobody reads.
export function useHasNew(filters: EventFiltersValue, snapshot: string | null) {
  return useQuery({
    queryKey: ['hasNew', filters, snapshot],
    refetchInterval: POLL_INTERVAL_MS,
    retry: shouldRetry,
    gcTime: POLL_INTERVAL_MS,
    queryFn:
      snapshot === null
        ? skipToken
        : async () => {
            const { error, data, response } = await client.GET(
              '/events/has-new',
              { params: { query: { ...toFilterQuery(filters), snapshot } } },
            );

            if (error !== undefined) {
              throw new ApiError(response.status, error);
            }

            return data;
          },
  });
}
