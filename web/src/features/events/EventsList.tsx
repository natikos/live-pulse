import {
  tableFeatures,
  useTable,
  type CellContext,
  type ColumnDef,
  type ColumnDefTemplate,
} from '@tanstack/react-table';
import type { StoredEvent } from './types';
import { useQuery } from '@tanstack/react-query';
import { client } from '@/api/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

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

const DATA_FALLBACK: StoredEvent[] = [];

export function EventsList() {
  const { isPending, error, data } = useQuery({
    queryKey: ['eventsList'],
    queryFn: async () => {
      const response = await client.GET('/events');
      if (response.data) {
        return response.data;
      }
      throw response.error;
    },
  });

  const table = useTable({
    features,
    columns,
    data: data?.items ?? DATA_FALLBACK,
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

  if (error) {
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

  if (data.items.length === 0) {
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
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 font-medium whitespace-nowrap"
                >
                  {header.isPlaceholder ? null : (
                    <table.FlexRender header={header} />
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="h-11 hover:bg-muted/50">
              {row.getAllCells().map((cell) => (
                <td
                  key={cell.id}
                  className="px-4 whitespace-nowrap tabular-nums"
                >
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
