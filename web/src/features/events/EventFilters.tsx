import { useState } from 'react';
import { XIcon } from 'lucide-react';
import { DateTimeField } from '@/components/DateTimeField';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const EVENT_TYPES = ['page_view', 'purchase', 'error'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventFiltersValue {
  types: EventType[];
  from?: Date;
  to?: Date;
}

interface EventFiltersProps {
  onApply: (value: EventFiltersValue) => void;
}

const EMPTY_FILTERS: EventFiltersValue = { types: [] };

export function EventFilters({ onApply }: EventFiltersProps) {
  const [value, onChange] = useState<EventFiltersValue>(EMPTY_FILTERS);
  const isEmpty = value.types.length === 0 && !value.from && !value.to;

  return (
    <div className="mb-4 flex flex-wrap items-end gap-2">
      <Select
        multiple
        value={value.types}
        onValueChange={(types) =>
          onChange({ ...value, types: types as EventType[] })
        }
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All event types" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {EVENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <DateTimeField
        label="From"
        boundary="start"
        value={value.from}
        onChange={(from) => onChange({ ...value, from })}
      />
      <DateTimeField
        label="To"
        boundary="end"
        value={value.to}
        onChange={(to) => onChange({ ...value, to })}
      />
      <Button onClick={() => onApply(value)}>Apply</Button>
      {!isEmpty && (
        <Button
          variant="ghost"
          onClick={() => {
            onChange(EMPTY_FILTERS);
            onApply(EMPTY_FILTERS);
          }}
        >
          <XIcon data-icon="inline-start" />
          Clear
        </Button>
      )}
    </div>
  );
}
