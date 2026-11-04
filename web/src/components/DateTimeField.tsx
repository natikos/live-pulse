import { useId, useState } from 'react';
import { format, isValid, parse } from 'date-fns';
import { maskitoDateTime } from '@maskito/kit';
import { useMaskito } from '@maskito/react';
import { CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type Boundary = 'start' | 'end';

interface Draft {
  text: string;
  base?: Date;
}

export interface DateTimeFieldProps {
  label: string;
  boundary: Boundary;
  value?: Date;
  onChange: (date?: Date) => void;
}

const TEXT_FORMAT = 'dd/MM/yyyy HH:mm:ss';
const TEXT_MASK = maskitoDateTime({
  dateMode: 'dd/mm/yyyy',
  dateSeparator: '/',
  timeMode: 'HH:MM:SS',
  dateTimeSeparator: ' ',
});
const BOUNDARY_TIME: Record<Boundary, string> = {
  start: '00:00:00',
  end: '23:59:59',
};

// endDate is inclusive in the API.
function withBoundary(date: Date, boundary: Boundary): Date {
  if (boundary === 'end' && date.getSeconds() === 59) {
    date.setMilliseconds(999);
  }
  return date;
}

function parseText(text: string, boundary: Boundary): Date | undefined {
  if (text.length !== TEXT_FORMAT.length) return undefined;
  const date = parse(text, TEXT_FORMAT, new Date());
  return isValid(date) ? withBoundary(date, boundary) : undefined;
}

export function DateTimeField({
  label,
  boundary,
  value,
  onChange,
}: DateTimeFieldProps) {
  const id = useId();
  const maskRef = useMaskito({ options: TEXT_MASK });
  const [draft, setDraft] = useState<Draft | null>(null);
  const activeDraft = draft && draft.base === value ? draft : null;
  const text = activeDraft
    ? activeDraft.text
    : value
      ? format(value, TEXT_FORMAT)
      : '';
  const isInvalid = activeDraft !== null && activeDraft.text !== '';

  const handleText = (next: string) => {
    if (next === '') {
      setDraft(null);
      onChange(undefined);
      return;
    }
    const parsed = parseText(next, boundary);
    if (parsed) {
      setDraft(null);
      onChange(parsed);
    } else {
      setDraft({ text: next, base: value });
    }
  };

  const handleDay = (day?: Date) => {
    if (!day) {
      return;
    }
    const time = value ? format(value, 'HH:mm:ss') : BOUNDARY_TIME[boundary];
    onChange(
      parseText(`${format(day, 'dd/MM/yyyy')} ${time}`, boundary) ?? day,
    );
  };

  return (
    <Field className="w-auto" data-invalid={isInvalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup className="w-56">
        <InputGroupInput
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder={TEXT_FORMAT.toLowerCase()}
          value={text}
          aria-invalid={isInvalid || undefined}
          ref={maskRef}
          onInput={(event) => handleText(event.currentTarget.value)}
          onChange={() => undefined}
          className="tabular-nums"
        />
        <InputGroupAddon align="inline-end">
          <Popover>
            <PopoverTrigger
              render={
                <InputGroupButton
                  size="icon-xs"
                  aria-label={`Pick ${label} date`}
                />
              }
            >
              <CalendarIcon />
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={value}
                defaultMonth={value}
                onSelect={handleDay}
              />
            </PopoverContent>
          </Popover>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
