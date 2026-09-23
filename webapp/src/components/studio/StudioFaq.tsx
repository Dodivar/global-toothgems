import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";

/**
 * The Studio's questions, as native `<details>` — keyboard-operable and
 * announced as expandable without any script, like the Loyalty FAQ.
 *
 * The answers are fictional prototype copy: availability, saving and the link
 * with ordering describe the intended product and must be checked against the
 * real Studio before launch.
 */
export function StudioFaq() {
  const { t } = useTranslation();
  const entries = t("studio.faq.items", { returnObjects: true }) as { question: string; answer: string }[];

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
          <p className="m-0 max-w-[var(--max-width-prose)] px-5 pb-5 text-[length:var(--text-body-sm)] leading-[1.7] text-[var(--text-body)]">
            {entry.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
