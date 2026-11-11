import {
  tableFeatures,
  useTable,
  type CellContext,
  type ColumnDef,
  type ColumnDefTemplate,
} from '@tanstack/react-table';
import type { StoredEvent } from './types';
import { useVirtualRows } from './useVirtualRows';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const features = tableFeatures({});

const nullableRender: ColumnDefTemplate<
  CellContext<typeof features, StoredEvent>
> = (data) => <>{data.getValue() ?? '—'}</>;

const columns: Array<ColumnDef<typeof features, StoredEvent>> = [
  { accessorKey: 'occurred_at', header: 'Occurred at' },
  { accessorKey: 'type', header: 'Type' },
  {
    accessorKey: 'user_id',
    header: 'User ID',
    cell: nullableRender,
  },
  { accessorKey: 'device_id', header: 'Device ID', cell: nullableRender },
  { accessorKey: 'source', header: 'Source' },
];

const COLUMN_WIDTHS: Record<string, string> = {
  occurred_at: 'w-60',
  type: 'w-32',
  source: 'w-28',
};

const DATA_FALLBACK: StoredEvent[] = [];

// px; must equal the row's `h-11` (Tailwind: 11 × 4px).
const ROW_HEIGHT = 44;

interface EventTableProps {
  events?: StoredEvent[];
  isPending: boolean;
  error: Error | null;
  onEndReached?: () => void;
}

export function EventTable({
  events,
  isPending,
  error,
  onEndReached,
}: EventTableProps) {
  const table = useTable({
    features,
    columns,
    data: events ?? DATA_FALLBACK,
  });

  const rows = table.getRowModel().rows;
  const { scrollRef, virtualRows, padding } = useVirtualRows({
    count: rows.length,
    rowHeight: ROW_HEIGHT,
    onEndReached,
  });

  if (isPending) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (error && !events) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load events</AlertTitle>
        <AlertDescription>
          {error instanceof Error
            ? error.message
            : 'The server returned an error. Try again in a moment.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!events || events.length === 0) {
    return (
      <Alert>
        <AlertTitle>No events found</AlertTitle>
        <AlertDescription>
          Nothing has been stored yet, or nothing matches the current filters.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div ref={scrollRef} className="h-[70vh] overflow-auto rounded-lg border">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={cn(
                    'px-4 py-3 font-medium whitespace-nowrap',
                    COLUMN_WIDTHS[header.column.id],
                  )}
                >
                  {header.isPlaceholder ? null : (
                    <table.FlexRender header={header} />
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {padding.top > 0 && (
            <tr aria-hidden>
              <td colSpan={columns.length} style={{ height: padding.top }} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <tr key={row.id} className="h-11 border-b hover:bg-muted/50">
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="truncate px-4 tabular-nums"
                    title={String(cell.getValue() ?? '')}
                  >
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
          {padding.bottom > 0 && (
            <tr aria-hidden>
              <td colSpan={columns.length} style={{ height: padding.bottom }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
