import type { EventFiltersValue } from './EventFilters';

// The list and the has-new check must send the same filters, or the notice
// would talk about a different set of events than the one on screen.
export function toFilterQuery(filters: EventFiltersValue) {
  return {
    type: filters.types.length > 0 ? filters.types : undefined,
    startDate: filters.from?.getTime(),
    endDate: filters.to?.getTime(),
  };
}
