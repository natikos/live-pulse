import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { EventFilters, type EventFiltersValue } from './EventFilters';
import { EventTable } from './EventTable';
import { NewEventsNotice } from './NewEventsNotice';
import { useEventList } from './useEventList';
import { useHasNew } from './useHasNew';

export function EventsPage() {
  const queryClient = useQueryClient();
  const [applied, setApplied] = useState<EventFiltersValue>({ types: [] });
  // The token the reader acknowledged, with the first-page token it belongs to.
  // A refresh or a filter change brings a new first page, which makes the pair
  // stale on its own, so nothing has to reset it.
  const [acknowledged, setAcknowledged] = useState<{
    base: string;
    token: string;
  } | null>(null);
  const {
    data,
    isPending,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useEventList(applied);

  const firstPageSnapshot = data?.snapshot ?? null;
  const pollSnapshot =
    acknowledged && acknowledged.base === firstPageSnapshot
      ? acknowledged.token
      : firstPageSnapshot;
  const { data: check } = useHasNew(applied, pollSnapshot);

  // After a failed page the user retries by hand; retrying here would loop.
  const canLoadMore =
    hasNextPage && !isFetchingNextPage && !isFetchNextPageError;

  // The token comes from the answer that showed the notice, not a later one.
  const dismiss = () => {
    if (firstPageSnapshot && check) {
      setAcknowledged({ base: firstPageSnapshot, token: check.snapshot });
    }
  };

  // Back to the initial state; the first page brings a new token, and the
  // table is keyed by it so it remounts with a fresh scroll position.
  const refresh = () =>
    queryClient.resetQueries({ queryKey: ['eventList', applied], exact: true });

  return (
    <>
      <EventFilters onApply={setApplied} />
      <EventTable
        key={firstPageSnapshot}
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
      {check?.hasNew && (
        <NewEventsNotice onRefresh={() => void refresh()} onDismiss={dismiss} />
      )}
    </>
  );
}
