import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

/**
 * The programme's rules, in the member's own words.
 *
 * Native `<details>`: it is keyboard-operable, announced as expandable and works
 * before any JavaScript runs, which no hand-rolled accordion gets for free.
 *
 * The answers restate exactly the rules the interface shows — a qualifying
 * purchase, five stamps, ten percent — and add none of their own. There is no
 * loyalty backend to define expiry, exclusions or stacking, so this page does
 * not invent any.
 */

interface Entry {
  question: string;
  answer: string;
}

export function LoyaltyFAQ() {
  const { t } = useTranslation();
  const entries = t("loyalty.faq", { returnObjects: true }) as Entry[];

  return (
    <div className="grid gap-3">
      {entries.map((entry) => (
        <details
          key={entry.question}
          className="group rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-[var(--space-5)] open:shadow-[var(--shadow-xs)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)] marker:content-none [&::-webkit-details-marker]:hidden">
            {entry.question}
            <Plus
              size={18}
              aria-hidden="true"
              className="flex-none text-[var(--gt-blue-700)] transition-transform duration-[var(--duration-fast)] group-open:rotate-45"
            />
          </summary>
          <p className="m-0 max-w-[var(--max-width-prose)] pb-5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            {entry.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
