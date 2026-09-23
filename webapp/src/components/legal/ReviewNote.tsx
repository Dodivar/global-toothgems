import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NotebookPen } from "lucide-react";
import clsx from "clsx";
import { useReviewMode } from "../../lib/reviewMode";

/**
 * A note addressed to the people reviewing the prototype, not to customers.
 * Hatched and dashed so it reads as scaffolding, labelled so it is never
 * mistaken for part of the policy, and gone when annotations are switched off.
 */
export function ReviewNote({ children, title, className }: { children: ReactNode; title?: string; className?: string }) {
  const { t } = useTranslation();
  const { showNotes } = useReviewMode();
  if (!showNotes) return null;
  return (
    <aside
      aria-label={t("legal.review.noteLabel")}
      className={clsx("gt-review-note grid gap-1.5 rounded-[var(--radius-md)] px-4 py-3 text-[length:var(--text-body-sm)] leading-[1.6] text-[var(--text-body)]", className)}
    >
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--text-muted)]">
        <NotebookPen size={13} aria-hidden="true" />
        {t("legal.review.noteLabel")}
      </span>
      {title && <strong className="text-[var(--text-primary)]">{title}</strong>}
      <div>{children}</div>
    </aside>
  );
}
