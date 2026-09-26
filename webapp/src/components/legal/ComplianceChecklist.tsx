import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, ClipboardCheck } from "lucide-react";
import { LAUNCH_CHECKLIST } from "../../data/legal/checklist";
import { pick } from "../../data/types";
import { useReviewMode } from "../../lib/reviewMode";
import { ReviewNote } from "./ReviewNote";

const STORAGE_KEY = "gt-launch-checklist";

function readChecked(): Record<string, boolean> {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

/**
 * Stripe & compliance pre-launch checklist — internal only.
 *
 * Everything starts unchecked: none of these has been verified, and a
 * prototype that shipped with green ticks would say otherwise. Ticks live in
 * the reviewer's browser only. Hidden with the other review annotations.
 */
export function ComplianceChecklist() {
  const { t, i18n } = useTranslation();
  const { showNotes } = useReviewMode();
  const [checked, setChecked] = useState<Record<string, boolean>>(readChecked);

  if (!showNotes) return null;

  const done = LAUNCH_CHECKLIST.filter((item) => checked[item.id]).length;
  const total = LAUNCH_CHECKLIST.length;

  const toggle = (id: string, value: boolean) => {
    const next = { ...checked, [id]: value };
    setChecked(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Storage unavailable: ticks last this visit. */
    }
  };

  return (
    <section aria-labelledby="launch-checklist" className="gt-review-note grid gap-5 rounded-[var(--radius-xl)] p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[var(--text-muted)]">
            <ClipboardCheck size={13} aria-hidden="true" />
            {t("legal.checklist.eyebrow")}
          </span>
          <h2 id="launch-checklist" className="text-[length:var(--text-h3)]">
            {t("legal.checklist.title")}
          </h2>
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("legal.checklist.body")}</p>
        </div>
        <div className="grid min-w-[160px] gap-1.5">
          <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]" aria-live="polite">
            {t("legal.checklist.progress", { done, total })}
          </span>
          <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[var(--gt-ink-200)]">
            <span className="block h-full rounded-full bg-[var(--gt-emerald-500)] transition-[width] duration-[var(--duration-normal)]" style={{ width: `${(done / total) * 100}%` }} />
          </span>
        </div>
      </div>

      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
        {LAUNCH_CHECKLIST.map((item) => {
          const id = `check-${item.id}`;
          const isDone = !!checked[item.id];
          return (
            <li key={item.id} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3.5 py-2.5">
              <input
                id={id}
                type="checkbox"
                checked={isDone}
                onChange={(e) => toggle(item.id, e.target.checked)}
                className="h-5 w-5 flex-none cursor-pointer accent-[var(--gt-emerald-600)]"
              />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-[length:var(--text-body-sm)] leading-[1.4] text-[var(--text-primary)]">
                {pick(item.label, i18n.language)}
                <span className="block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {isDone ? t("legal.checklist.verified") : t("legal.checklist.pending")}
                </span>
              </label>
              {item.to && (
                <Link
                  to={item.to}
                  aria-label={t("legal.checklist.open", { item: pick(item.label, i18n.language) })}
                  className="grid h-9 w-9 flex-none place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]"
                >
                  <ArrowUpRight size={16} aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <ReviewNote className="bg-[var(--surface-card)]">{t("legal.checklist.disclaimer")}</ReviewNote>
    </section>
  );
}
