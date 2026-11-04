import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeToggle } from '@/components/ThemeToggle';
import { EventsPage } from './features/events/EventsPage';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-6xl p-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Live Pulse</h1>
          <ThemeToggle />
        </header>
        <EventsPage />
      </main>
    </QueryClientProvider>
  );
}
