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
    fetchNextPage,
  } = useEventList(applied);

  return (
    <>
      <EventFilters onApply={setApplied} />
      <EventTable events={data?.events} isPending={isPending} error={error} />
      {hasNextPage && (
        <Button
          variant="outline"
          className="mt-4"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </>
  );
}
