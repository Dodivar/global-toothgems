/**
 * "2 days ago" / "il y a 2 jours" for the library's dates, in the UI language.
 * `Intl.RelativeTimeFormat` does the wording; this only picks the unit.
 */

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** Below this, the moment reads as "just now" (a translation key, not a number). */
export const JUST_NOW_MS = 45_000;

export function relativeParts(iso: string, now = Date.now()): { value: number; unit: Intl.RelativeTimeFormatUnit } | null {
  const diff = Date.parse(iso) - now;
  if (!Number.isFinite(diff) || Math.abs(diff) < JUST_NOW_MS) return null;
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === "minute") return { value: Math.round(diff / ms), unit };
  }
  return null;
}

export function formatRelative(iso: string, language: string, justNow: string, now = Date.now()): string {
  const parts = relativeParts(iso, now);
  if (!parts) return justNow;
  return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(parts.value, parts.unit);
}
