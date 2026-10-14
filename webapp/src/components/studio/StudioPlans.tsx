import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "../ui/Button";
import { useFormat } from "../../lib/format";
import { STUDIO_PLANS, type StudioPlan } from "../../data/studio";

/**
 * The Studio's offers side by side: the free trial and the three monthly
 * plans (`STUDIO_PLANS`). Stacked on phones, two by two on tablets, one row on
 * wide screens. The featured plan carries a written badge, not only a colour.
 *
 * The trial opens the Studio (`onTrial`); a paid plan leads to the
 * subscription page (`onChoose`) — nothing is bought from here.
 */
export function StudioPlans({ onTrial, onChoose }: { onTrial: () => void; onChoose: (plan: StudioPlan) => void }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();

  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
      {STUDIO_PLANS.map((plan) => {
        const trial = plan.id === "trial";
        const dark = plan.featured;
        const features = t(`studio.plans.items.${plan.id}.features`, { returnObjects: true }) as string[];
        return (
          <li
            key={plan.id}
            className={clsx(
              "relative grid content-start gap-5 rounded-[var(--radius-xl)] border p-5 sm:p-6",
              dark
                ? "gt-studio-offer border-transparent text-[var(--gt-ink-200)] shadow-[var(--shadow-lg)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)]",
            )}
          >
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={clsx("text-[length:var(--text-h4)]", dark && "text-[var(--gt-off-white)]")}>{t(`studio.plans.items.${plan.id}.name`)}</h3>
                {plan.featured && (
                  <span className="rounded-[var(--radius-pill)] bg-[var(--gt-blue-300)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]">
                    {t("studio.plans.featured")}
                  </span>
                )}
                {trial && (
                  <span className="rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--status-success-fg)]">
                    {t("studio.plans.trialBadge", { count: plan.trialDays })}
                  </span>
                )}
              </div>
              <p className={clsx("m-0 text-[length:var(--text-body-sm)]", dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]")}>
                {t(`studio.plans.items.${plan.id}.pitch`)}
              </p>
            </div>

            <p className={clsx("m-0 flex items-baseline gap-1.5", dark ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]")}>
              <span className="text-[clamp(36px,9vw,44px)] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)]">
                {trial ? t("studio.plans.free") : formatMoney(plan.amountMinor, plan.currency)}
              </span>
              <span className={clsx("text-[length:var(--text-body-sm)] font-semibold", dark ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]")}>
                {trial ? t("studio.plans.trialPeriod", { count: plan.trialDays }) : t("studio.plans.perMonth")}
              </span>
            </p>

            <Button
              variant={dark || trial ? "primary" : "outline"}
              size="lg"
              fullWidth
              iconRight={ArrowRight}
              onClick={() => (trial ? onTrial() : onChoose(plan))}
              className={clsx(dark && "gt-studio-cta")}
            >
              {trial ? t("studio.plans.ctaTrial") : t("studio.plans.ctaPaid", { plan: t(`studio.plans.items.${plan.id}.name`) })}
            </Button>

            <ul className="m-0 grid list-none gap-2.5 p-0">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-[length:var(--text-body-sm)]">
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full",
                      dark ? "bg-white/10 text-[var(--gt-blue-300)]" : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
                    )}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
