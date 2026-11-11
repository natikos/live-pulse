import { client } from '@/api/client';
import { ApiError, shouldRetry } from '@/api/errors';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { EventFiltersValue } from './EventFilters';

export function useEventList(filters: EventFiltersValue) {
  return useInfiniteQuery({
    queryKey: ['eventList', filters],
    initialPageParam: undefined as string | undefined,
    retry: shouldRetry,
    // A refetch reloads every loaded page and shifts rows under the reader;
    // the list changes only on an explicit refresh.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async ({ pageParam }) => {
      const { error, data, response } = await client.GET('/events', {
        params: {
          query: {
            limit: 100,
            type: filters.types.length > 0 ? filters.types : undefined,
            startDate: filters.from?.getTime(),
            endDate: filters.to?.getTime(),
            cursor: pageParam,
          },
        },
      });

      if (error !== undefined) {
        throw new ApiError(response.status, error);
      }

      return data;
    },
    getNextPageParam: ({ nextCursor }) => nextCursor,
    select: ({ pages }) => ({
      events: pages.flatMap(({ items }) => items),
    }),
  });
}
