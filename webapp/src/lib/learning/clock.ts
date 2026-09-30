/** Time helpers for the lesson video player. */

/** Real media the browser can stream; anything else is a placeholder source. */
export function isStreamableSource(source: string): boolean {
  return /^(https?:|blob:)/i.test(source);
}

/** "08:40" or "1:02:05" → seconds. Falls back to a minute for unparsable input. */
export function parseClock(value: string): number {
  const parts = value.split(":").map((p) => Number(p));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n) || n < 0)) return 60;
  const seconds = parts.reduce((total, n) => total * 60 + n, 0);
  return seconds > 0 ? seconds : 60;
}

export function formatClock(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const rest = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${rest}` : rest;
}
