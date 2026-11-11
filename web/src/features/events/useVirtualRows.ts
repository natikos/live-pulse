import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const OVERSCAN = 15;
const LOAD_MORE_THRESHOLD = 40;

interface UseVirtualRowsOptions {
  count: number;
  rowHeight: number;
  onEndReached?: () => void;
}

export function useVirtualRows({
  count,
  rowHeight,
  onEndReached,
}: UseVirtualRowsOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: OVERSCAN,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const first = virtualRows.at(0);
  const last = virtualRows.at(-1);
  const padding = {
    top: first?.start ?? 0,
    bottom: last ? virtualizer.getTotalSize() - last.end : 0,
  };

  const lastIndex = last?.index ?? -1;
  useEffect(() => {
    if (lastIndex >= 0 && lastIndex >= count - LOAD_MORE_THRESHOLD) {
      onEndReached?.();
    }
  }, [lastIndex, count, onEndReached]);

  return { scrollRef, virtualRows, padding };
}
