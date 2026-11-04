import { format } from 'date-fns';
import { CalendarIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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

export type EventFiltersValue = {
  types: EventType[];
  from?: Date;
  to?: Date;
};

type EventFiltersProps = {
  value: EventFiltersValue;
  onChange: (value: EventFiltersValue) => void;
};

type DateFieldProps = {
  label: string;
  value?: Date;
  onChange: (date?: Date) => void;
};

function DateField({ label, value, onChange }: DateFieldProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className="w-44 justify-start font-normal"
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {value ? format(value, 'yyyy-MM-dd') : label}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar mode="single" selected={value} onSelect={onChange} />
      </PopoverContent>
    </Popover>
  );
}

export function EventFilters({ value, onChange }: EventFiltersProps) {
  const isEmpty = value.types.length === 0 && !value.from && !value.to;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
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
      <DateField
        label="From"
        value={value.from}
        onChange={(from) => onChange({ ...value, from })}
      />
      <DateField
        label="To"
        value={value.to}
        onChange={(to) => onChange({ ...value, to })}
      />
      {!isEmpty && (
        <Button variant="ghost" onClick={() => onChange({ types: [] })}>
          <XIcon data-icon="inline-start" />
          Clear
        </Button>
      )}
    </div>
  );
}
