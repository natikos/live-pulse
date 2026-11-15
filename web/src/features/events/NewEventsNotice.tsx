import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface NewEventsNoticeProps {
  onRefresh: () => void;
  onDismiss: () => void;
}

// Fixed, so it never pushes the list the reader is looking at.
export function NewEventsNotice({
  onRefresh,
  onDismiss,
}: NewEventsNoticeProps) {
  return (
    <Alert
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 w-80 shadow-lg"
    >
      <AlertTitle>New events have arrived</AlertTitle>
      <AlertDescription>
        Events that match your filters were added after you opened this list.
      </AlertDescription>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={onRefresh}>
          Refresh
        </Button>
        <Button size="sm" variant="outline" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </Alert>
  );
}
