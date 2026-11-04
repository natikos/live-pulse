import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  EventFilters,
  type EventFiltersValue,
} from './features/events/EventFilters';
import { EventsList } from './features/events/EventsList';

const queryClient = new QueryClient();

export default function App() {
  const [filters, setFilters] = useState<EventFiltersValue>({ types: [] });

  return (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-6xl p-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Live Pulse</h1>
          <ThemeToggle />
        </header>
        <EventFilters value={filters} onChange={setFilters} />
        <EventsList />
      </main>
    </QueryClientProvider>
  );
}
