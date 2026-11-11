import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { EventFilters, type EventFiltersValue } from './EventFilters';
import { EventTable } from './EventTable';
import { useEventList } from './useEventList';

export function EventsPage() {
  const [applied, setApplied] = useState<EventFiltersValue>({ types: [] });
  const {
    data,
    isPending,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useEventList(applied);

  // After a failed page the user retries by hand; retrying here would loop.
  const canLoadMore =
    hasNextPage && !isFetchingNextPage && !isFetchNextPageError;

  return (
    <>
      <EventFilters onApply={setApplied} />
      <EventTable
        events={data?.events}
        isPending={isPending}
        error={error}
        onEndReached={canLoadMore ? () => void fetchNextPage() : undefined}
      />
      {hasNextPage && (
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => {
            if (!isFetchingNextPage) {
              void fetchNextPage();
            }
          }}
        >
          {isFetchNextPageError
            ? 'Could not load more events. Retry'
            : 'Load more'}
        </Button>
      )}
    </>
  );
}
