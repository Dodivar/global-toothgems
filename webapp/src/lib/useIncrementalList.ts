import { useEffect, useState } from "react";

/**
 * Shows a long list a page at a time: the first `pageSize` entries, then the
 * next page when the end of the list scrolls into view (or "Show more" is
 * pressed). Changing `resetKey` (a filter, a folder) starts again from the
 * first page. Nothing is fetched here — it bounds what the page draws, which
 * for an image grid is what it downloads.
 */
export function useIncrementalList<T>(items: T[], pageSize: number, resetKey: string) {
  const [limit, setLimit] = useState(pageSize);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setLimit(pageSize);
  }
  // A callback ref kept in state: the observer follows the element as it mounts.
  const [node, setNode] = useState<HTMLElement | null>(null);
  const hasMore = items.length > limit;

  useEffect(() => {
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((value) => value + pageSize);
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, hasMore, pageSize, limit]);

  return {
    visible: hasMore ? items.slice(0, limit) : items,
    remaining: Math.max(0, items.length - limit),
    hasMore,
    showMore: () => setLimit((value) => value + pageSize),
    /** The `ref` of an element right after the list. */
    sentinelRef: setNode,
  };
}
