import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatCount, formatPrice } from "../../../lib/format";
import { formatRelative } from "../../../lib/studioWorkspace/relativeTime";

/**
 * Shared look of the Studio workspace: the few class lists every card,
 * chip and field repeats, and the formatting its metadata needs.
 */

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

export const iconButton = clsx(
  "inline-grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-pill)] text-[var(--gt-ink-600)] transition-colors",
  "hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-40",
  focusRing,
);

export const fieldClass = clsx(
  "w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 py-2.5",
  "text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)]",
  "focus:border-[var(--focus-ring)] focus-visible:shadow-[var(--shadow-focus)] aria-[invalid=true]:border-[var(--gt-red-400)]",
);

export const chipClass = (active: boolean) =>
  clsx(
    "inline-flex h-8 flex-none items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] border px-3.5 text-[12px] font-semibold transition-colors",
    focusRing,
    active
      ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white"
      : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--gt-ink-700)] hover:border-[var(--gt-blue-400)]",
  );

export const tagChip =
  "inline-flex items-center rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--gt-blue-700)]";

export const eyebrow = "m-0 text-[10.5px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-600)]";

/** Prices, counts and relative dates in the UI language; relative dates refresh each minute. */
export function useWorkspaceFormat() {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const price = useCallback((minor: number) => formatPrice(minor / 100), []);
  const count = useCallback((n: number) => formatCount(n), []);
  const ago = useCallback(
    (iso: string) => formatRelative(iso, i18n.language.slice(0, 2), t("studio.workspace.justNow"), now),
    [i18n.language, t, now],
  );
  return { t, price, count, ago, now };
}
