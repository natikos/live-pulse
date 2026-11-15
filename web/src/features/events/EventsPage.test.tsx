import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { EventsPage } from './EventsPage';

const { GET } = vi.hoisted(() => ({ GET: vi.fn() }));
vi.mock('@/api/client', () => ({ client: { GET } }));
// The real filters are a base-ui Select that jsdom cannot drive with clicks;
// what matters here is what the page does when filters are applied.
vi.mock('./EventFilters', () => ({
  EventFilters: ({
    onApply,
  }: {
    onApply: (v: { types: string[] }) => void;
  }) => (
    <button onClick={() => onApply({ types: ['purchase'] })}>
      Apply purchase
    </button>
  ),
}));

const NOTICE = 'New events have arrived';

interface HasNewAnswer {
  hasNew: boolean;
  snapshot: string;
}

// `listSnapshots` are handed out to successive first pages; `answers` map the
// token a poll was sent with to the server's answer.
function mockApi(
  listSnapshots: string[],
  answers: Record<string, HasNewAnswer>,
) {
  const snapshots = [...listSnapshots];
  GET.mockImplementation(async (path: string, init: any) => {
    const response = new Response();
    if (path === '/events') {
      return {
        data: { items: [], nextCursor: null, snapshot: snapshots.shift() },
        response,
      };
    }
    return { data: answers[init.params.query.snapshot], response };
  });
}

function polledWith() {
  return GET.mock.calls
    .filter(([path]) => path === '/events/has-new')
    .map(([, init]) => init.params.query.snapshot as string);
}

function renderPage() {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <EventsPage />
    </QueryClientProvider>,
  );
}

describe('EventsPage new-events notice', () => {
  // Braces: a function returned from beforeEach would run as a cleanup hook.
  beforeEach(() => {
    GET.mockReset();
  });
  // No vitest globals, so Testing Library does not unmount by itself.
  afterEach(cleanup);

  test('polls with the snapshot of the first page', async () => {
    mockApi(['S1'], { S1: { hasNew: false, snapshot: 'S2' } });

    renderPage();

    await waitFor(() => expect(polledWith()).toEqual(['S1']));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  test('shows the notice when events have arrived', async () => {
    mockApi(['S1'], { S1: { hasNew: true, snapshot: 'S2' } });

    renderPage();

    expect(await screen.findByText(NOTICE)).toBeTruthy();
  });

  test('dismissing hides the notice and polls with the token that showed it', async () => {
    mockApi(['S1'], {
      S1: { hasNew: true, snapshot: 'S2' },
      S2: { hasNew: false, snapshot: 'S3' },
    });
    renderPage();

    await screen.findByText(NOTICE);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() => expect(polledWith()).toEqual(['S1', 'S2']));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  test('refreshing loads a new first page and polls with its token', async () => {
    mockApi(['S1', 'S4'], {
      S1: { hasNew: true, snapshot: 'S2' },
      S4: { hasNew: false, snapshot: 'S5' },
    });
    renderPage();

    await screen.findByText(NOTICE);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(polledWith()).toEqual(['S1', 'S4']));
    const listCalls = GET.mock.calls.filter(([path]) => path === '/events');
    expect(listCalls).toHaveLength(2);
    expect(listCalls[1][1].params.query.cursor).toBeUndefined();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  test('a filter change polls with the new first page, not the acknowledged token', async () => {
    mockApi(['S1', 'S6'], {
      S1: { hasNew: true, snapshot: 'S2' },
      S2: { hasNew: false, snapshot: 'S3' },
      S6: { hasNew: false, snapshot: 'S7' },
    });
    renderPage();
    await screen.findByText(NOTICE);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(polledWith()).toEqual(['S1', 'S2']));

    fireEvent.click(screen.getByRole('button', { name: 'Apply purchase' }));

    await waitFor(() => expect(polledWith()).toEqual(['S1', 'S2', 'S6']));
    const lastPoll = GET.mock.calls.filter(
      ([path]) => path === '/events/has-new',
    )[2];
    expect(lastPoll[1].params.query.type).toEqual(['purchase']);
  });
});
