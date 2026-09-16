import { useTranslation } from "react-i18next";
import { CheckCheck, Gift, ShoppingBag, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * How the programme works, in four moves.
 *
 * The copy is a `returnObjects` array in the locale files — the same convention
 * the footer columns use — so the two languages stay one edit apart, and the
 * numerals here carry the hierarchy rather than four competing headlines.
 */

interface Step {
  title: string;
  body: string;
}

const ICONS: LucideIcon[] = [ShoppingBag, Sparkles, CheckCheck, Gift];

export function LoyaltySteps() {
  const { t } = useTranslation();
  const steps = t("loyalty.steps", { returnObjects: true }) as Step[];

  return (
    <ol className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
      {steps.map((step, i) => {
        const Icon = ICONS[i % ICONS.length];
        return (
          <li
            key={step.title}
            className="grid content-start gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[34px] font-[var(--weight-black)] leading-none tabular-nums tracking-[var(--tracking-display)] text-[var(--gt-blue-300)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Icon size={20} strokeWidth={1.6} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
            </div>
            <h3 className="text-[length:var(--text-h4)] uppercase tracking-[var(--tracking-tight)]">{step.title}</h3>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{step.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
