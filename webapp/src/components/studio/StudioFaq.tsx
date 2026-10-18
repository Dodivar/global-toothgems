import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

/**
 * The questions asked before subscribing, on the alternative Studio page.
 *
 * Native `<details>`, like the rest of the site: keyboard-operable and
 * announced as expandable without a line of script. Answers that depend on
 * business rules nobody has written yet (trial expiry, changing plan) carry a
 * visible "to be confirmed" chip instead of an invented policy.
 */
interface Entry {
  question: string;
  answer: string;
  /** The answer describes a rule that is not decided yet. */
  placeholder?: boolean;
}

export function StudioFaq() {
  const { t } = useTranslation();
  const entries = t("studioPage.faq.items", { returnObjects: true }) as Entry[];

  return (
    <div className="grid gap-2.5">
      {entries.map((entry, i) => (
        <details
          key={entry.question}
          open={i === 0 || undefined}
          className="gt-faq-item group rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] transition-[border-color,box-shadow] duration-[var(--duration-fast)] hover:border-[var(--gt-blue-200)] open:border-[var(--gt-blue-200)] open:shadow-[var(--shadow-sm)]"
        >
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-[var(--radius-card)] px-5 py-3.5">
            <h3 className="text-[length:var(--text-body-md)] font-semibold leading-[1.4] tracking-normal">{entry.question}</h3>
            <span
              aria-hidden="true"
              className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)] transition-transform duration-[var(--duration-normal)] group-open:rotate-45"
            >
              <Plus size={16} />
            </span>
          </summary>
          <div className="grid max-w-[var(--max-width-prose)] gap-2 px-5 pb-5">
            {entry.placeholder && (
              <span className="w-fit rounded-[var(--radius-pill)] border border-dashed border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
                {t("studioPage.faq.placeholderLabel")}
              </span>
            )}
            <p className="m-0 text-[length:var(--text-body-sm)] leading-[1.7] text-[var(--text-body)]">{entry.answer}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
