import { useEffect, useRef } from "react";

/**
 * Runs `callback` every `intervalMs` while the page is visible, and once more
 * as soon as a hidden tab is shown again. A tab left in the background does
 * nothing, so it costs no requests (or downloads) while nobody looks at it.
 */
export function useVisibleInterval(callback: () => void, intervalMs: number, enabled: boolean): void {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") saved.current();
    };
    const timer = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, intervalMs]);
}
