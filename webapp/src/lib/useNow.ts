import { useEffect, useState } from "react";

/**
 * The current time as state (milliseconds since epoch), refreshed every
 * minute: a screen that compares dates with "now" stays correct while it is
 * left open, and reading the clock stays out of the render itself. Browser
 * only (the back office): the first value is read when the screen mounts.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
