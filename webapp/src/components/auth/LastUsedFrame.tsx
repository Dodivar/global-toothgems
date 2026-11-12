"use client";

import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";

/**
 * Puts a small "Last used" badge on the top-right corner of a sign-in button
 * (`lib/lastSignInMethod.ts`). The badge sits outside the button itself, so it
 * also works around Google's own button, which is an iframe we cannot draw
 * into. Screen readers hear it with the button (`aria-describedby` where we
 * draw the button; for Google's iframe, as the text right after it).
 */
export function LastUsedFrame({
  active,
  children,
}: {
  active: boolean;
  /** Receives the badge's id (or undefined when hidden) to put on the button's `aria-describedby`. */
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="relative">
      {children(active ? id : undefined)}
      {active && (
        <span
          id={id}
          className="pointer-events-none absolute -top-2.5 right-3 z-[1] inline-flex h-[22px] items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-100)] px-2 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)] shadow-[var(--shadow-xs)]"
        >
          <History size={11} aria-hidden="true" />
          {t("authAlt.lastUsed")}
        </span>
      )}
    </div>
  );
}
