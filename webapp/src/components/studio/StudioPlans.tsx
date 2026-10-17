import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowRight, Gift, Info } from "lucide-react";
import { Button } from "../ui/Button";
import { useFormat } from "../../lib/format";
import { STUDIO_PLANS, type StudioPlan } from "../../data/studio";

/**
 * The Studio's offers in the alternative page's dress: the free trial as an
 * introductory banner, then the three monthly plans side by side.
 *
 * Plan names, amounts and the trial's length are the project's own
 * (`data/studio.ts`, `studio.plans.items.*.name`) — this page invents none of
 * them. What each plan *includes* is not decided yet, so instead of a feature
 * list each card carries a visible "to be defined" note. Nothing is bought
 * here: the trial opens the Studio (`onTrial`) and a paid plan leads to the
 * subscription page (`onChoose`), exactly as on `/studio-3d`.
 */
export function StudioPlans({ onTrial, onChoose }: { onTrial: () => void; onChoose: (plan: StudioPlan) => void }) {
  const { t } = useTranslation();

  const trial = STUDIO_PLANS.find((plan) => plan.id === "trial")!;
  const trialDays = trial.trialDays!;

  return (
    <div className="grid gap-5">
      {/* ------------------------------------------------------- Free trial */}
      <div className="gt-studio-b-trial grid gap-5 rounded-[var(--radius-xl)] border border-[var(--gt-blue-200)] p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10">
        <div className="grid gap-2.5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--status-success-fg)]">
            <Gift size={12} aria-hidden="true" />
            {t("studioPage.plans.trial.badge", { count: trialDays })}
          </span>
          <h3 className="text-[length:var(--text-h3)] font-[var(--weight-black)] tracking-[var(--tracking-display)]">
            {t("studioPage.plans.trial.name")} · {t("studioPage.plans.trial.price", { count: trialDays })}
          </h3>
          <p className="m-0 max-w-[58ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("studioPage.plans.trial.body")}</p>
        </div>
        <div className="grid gap-2 lg:justify-items-end">
          <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={onTrial} className="gt-studio-cta lg:w-auto">
            {t("studioPage.plans.trial.cta")}
          </Button>
          <p className="m-0 max-w-[36ch] text-[length:var(--text-caption)] text-[var(--text-muted)] lg:text-right">
            {t("studioPage.plans.trial.note", { count: trialDays })}
          </p>
        </div>
      </div>

      <StudioPaidPlans onChoose={onChoose} />
    </div>
  );
}

/**
 * The three monthly plans as cards, each with its own call to action. Shared
 * by the presentation page and the Studio's locked screen
 * (`StudioAccessGate`), so both always show the same configured plans.
 */
export function StudioPaidPlans({ onChoose }: { onChoose: (plan: StudioPlan) => void }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const paid = STUDIO_PLANS.filter((plan) => plan.id !== "trial");

  // Two by two on a tablet, one row from 1024px: below that, three columns
  // leave a card too narrow for a "Choose <plan>" button.
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {paid.map((plan) => {
        const name = t(`studio.plans.items.${plan.id}.name`);
        return (
          <li
            key={plan.id}
            className={clsx(
              "gt-studio-b-plan relative grid content-start gap-5 rounded-[var(--radius-xl)] border bg-[var(--surface-card)] p-5 sm:p-6",
              plan.featured ? "gt-studio-b-plan--featured" : "border-[var(--border-subtle)]",
            )}
          >
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[length:var(--text-h4)]">{name}</h3>
                {plan.featured && (
                  <span className="rounded-[var(--radius-pill)] bg-[var(--gt-emerald-300)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]">
                    {t("studioPage.plans.featured")}
                  </span>
                )}
              </div>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t(`studioPage.plans.items.${plan.id}`)}</p>
            </div>

            <p className="m-0 flex items-baseline gap-1.5 text-[var(--text-primary)]">
              <span className="text-[clamp(34px,8vw,42px)] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)]">
                {formatMoney(plan.amountMinor, plan.currency)}
              </span>
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)]">{t("studioPage.plans.perMonth")}</span>
            </p>

            <Button
              variant={plan.featured ? "primary" : "outline"}
              size="lg"
              fullWidth
              iconRight={ArrowRight}
              onClick={() => onChoose(plan)}
              className={clsx(plan.featured && "gt-studio-cta")}
            >
              {t("studioPage.plans.cta", { plan: name })}
            </Button>

            {/* What the plan includes is undecided: say so rather than invent it. */}
            <div className="grid gap-1.5 rounded-[var(--radius-md)] border border-dashed border-[var(--gt-blue-300)] bg-[var(--gt-blue-50)] p-3.5">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
                <Info size={12} aria-hidden="true" />
                {t("studioPage.plans.detailsTitle")}
              </span>
              <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{t("studioPage.plans.details")}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
