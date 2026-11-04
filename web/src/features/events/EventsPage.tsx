import { useState } from 'react';
import { EventFilters, type EventFiltersValue } from './EventFilters';
import { EventTable } from './EventTable';

export function EventsPage() {
  const [filters, setFilters] = useState<EventFiltersValue>({ types: [] });

  return (
    <>
      <EventFilters value={filters} onChange={setFilters} />
      <EventTable />
    </>
  );
}
