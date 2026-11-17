import { useCallback, useEffect, useRef, useState } from "react";
import type { DramaCardPage, DramaChannelMeta } from "@/types/drama";

/**
 * A list that loads page by page: the first page on mount (and again when `fetchPage` changes, e.g.
 * a new search), the next as the viewer nears the end. A failed later page keeps what is shown and
 * is tried again the next time the end is reached. Results of an older `fetchPage` are dropped, so a
 * slow answer to an old search never replaces the new one.
 */
export function usePagedCards(
  fetchPage: (cursor?: string) => Promise<DramaCardPage>,
  enabled = true,
) {
  const [items, setItems] = useState<DramaChannelMeta[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const moreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const generationRef = useRef(0);

  const reload = useCallback(async () => {
    const generation = ++generationRef.current;
    loadingMoreRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const first = await fetchPage();
      if (generation !== generationRef.current) return;
      cursorRef.current = first.nextCursor;
      moreRef.current = first.nextCursor !== null;
      setItems(first.items);
    } catch (err) {
      if (generation !== generationRef.current) return;
      setItems([]);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    if (enabled) void reload();
    else {
      generationRef.current++;
      setItems([]);
      setLoading(false);
      setError(null);
    }
  }, [enabled, reload]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!moreRef.current || !cursor || loadingMoreRef.current) return;
    const generation = generationRef.current;
    loadingMoreRef.current = true;
    try {
      const next = await fetchPage(cursor);
      if (generation !== generationRef.current) return;
      cursorRef.current = next.nextCursor;
      moreRef.current = next.nextCursor !== null;
      setItems((prev) => {
        const seen = new Set(prev.map((d) => d.dramaId));
        return [...prev, ...next.items.filter((d) => !seen.has(d.dramaId))];
      });
    } catch (err) {
      console.warn("Failed to load more:", err);
    } finally {
      if (generation === generationRef.current) loadingMoreRef.current = false;
    }
  }, [fetchPage]);

  return { items, loading, error, reload, loadMore };
}
