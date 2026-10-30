"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowRight, Check, CircleCheck, Gift } from "lucide-react";
import { Button } from "../ui/Button";
import { trackStudio } from "../../lib/studioAnalytics";
import { useNavigate } from "../../lib/navigation";
import { useAuth } from "../../lib/auth";
import { RETURN_PARAM, SIGN_IN_PATH } from "../../lib/authRoutes";
import { studioCheckoutPath, type StudioCheckoutSurface } from "../../lib/studioUrl";
import { useFormat } from "../../lib/format";
import { useStudioPlanPrices } from "../../lib/studioBilling";
import { displayPrice, monthsFreeOf, type StudioPlanPrice } from "../../lib/studioBillingMapping";
import { hasFeature, type StudioFeature } from "../../lib/studioEntitlements";
import {
  STUDIO_PLAN_FEATURES,
  STUDIO_PLANS,
  type StudioBillingInterval,
  type StudioPaidPlanId,
  type StudioPlan,
} from "../../data/studio";

/** The member's subscription page (`app/compte/(space)/studio`). */
export const ACCOUNT_STUDIO_PATH = "/compte/studio";

export type ChooseStudioPlan =(plan: StudioPaidPlanId, interval: StudioBillingInterval, price: StudioPlanPrice | null) => void;

/**
 * The Studio's offers in the alternative page's dress: the free trial as an
 * introductory banner, then the three paid plans side by side.
 *
 * Plan names, amounts and the trial's length are the project's own
 * (`data/studio.ts`, `studio_plan_prices`, `studio.plans.items.*.name`) — this
 * page invents none of them. What each plan includes is `STUDIO_PLAN_FEATURES`
 * (decision 113), enforced by the database. Nothing is bought here: the trial opens the Studio (`onTrial`) and a
 * paid plan leads to its checkout (`onChoose`).
 */
export function StudioPlans({ onTrial, onChoose }: { onTrial: () => void; onChoose?: ChooseStudioPlan }) {
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

      {onChoose ? <StudioPaidPlans onChoose={onChoose} /> : <StudioCheckoutPlans surface="studio_page" />}
    </div>
  );
}

/**
 * The paid plans wired to the checkout: a plan button leads to the checkout
 * page of that plan (`/studio-3d/paiement`, `screens/StudioCheckout.tsx`),
 * where the member pays and the Studio then opens. A visitor signs in first
 * (the subscription belongs to an account) and lands on that page.
 */
export function StudioCheckoutPlans({ surface }: { surface: StudioCheckoutSurface }) {
  const navigate = useNavigate();
  const { signedIn } = useAuth();

  const choose: ChooseStudioPlan = (plan, interval, price) => {
    const checkout = studioCheckoutPath({ plan, interval, surface });
    if (!signedIn) {
      navigate(`${SIGN_IN_PATH}?${new URLSearchParams({ [RETURN_PARAM]: checkout })}`);
      return;
    }
    trackStudio("studio_subscription_cta_clicked", {
      plan_id: plan,
      interval,
      price_minor: price?.amountMinor ?? null,
      currency: price?.currency ?? null,
      surface,
      checkout_available: true,
    });
    navigate(checkout);
  };

  return <StudioPaidPlans onChoose={choose} />;
}

/**
 * The three paid plans as cards, billed monthly or yearly (the switch above
 * them), each with its own call to action. Shared by the presentation page,
 * the subscription page and the Studio's locked screen (`StudioAccessGate`),
 * so all show the same plans. Amounts are the live Stripe prices
 * (`studio_plan_prices`) once read, the confirmed display values before.
 *
 * On the member's subscription page (decision 112) `current` marks the plan and
 * billing they have (opened on that billing), the other cards switch to theirs,
 * and `locked` holds every switch while the subscription cannot change.
 */
export function StudioPaidPlans({
  onChoose,
  current = null,
  locked = false,
}: {
  onChoose: ChooseStudioPlan;
  current?: { plan: StudioPaidPlanId; interval: StudioBillingInterval } | null;
  locked?: boolean;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const live = useStudioPlanPrices();
  const [interval, setInterval] = useState<StudioBillingInterval>(current?.interval ?? "month");
  const paid = STUDIO_PLANS.filter((plan): plan is StudioPlan & { id: StudioPaidPlanId } => plan.id !== "trial");
  const monthsFree = Math.max(
    0,
    ...paid.map((plan) => monthsFreeOf(displayPrice(plan.id, "month", live), displayPrice(plan.id, "year", live))),
  );

  return (
    <div className="grid gap-4">
      <div
        role="group"
        aria-label={t("studioPage.plans.intervalLabel")}
        className="mx-auto inline-flex flex-wrap items-center justify-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1"
      >
        {(["month", "year"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={interval === value}
            onClick={() => setInterval(value)}
            className={clsx(
              "inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
              interval === value ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]" : "text-[var(--text-primary)] hover:bg-[var(--gt-blue-50)]",
            )}
          >
            {t(value === "month" ? "studioPage.plans.monthly" : "studioPage.plans.yearly")}
            {value === "year" && monthsFree > 0 && (
              <span className="rounded-[var(--radius-pill)] bg-[var(--gt-emerald-300)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]">
                {t("studioPage.plans.monthsFree", { count: monthsFree })}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Two by two on a tablet, one row from 1024px: below that, three columns
          leave a card too narrow for a "Choose <plan>" button. */}
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {paid.map((plan) => {
          const name = t(`studio.plans.items.${plan.id}.name`);
          const price = displayPrice(plan.id, interval, live);
          const isCurrent = current?.plan === plan.id && current.interval === interval;
          return (
            <li
              key={plan.id}
              className={clsx(
                "gt-studio-b-plan relative grid content-start gap-5 rounded-[var(--radius-xl)] border bg-[var(--surface-card)] p-5 sm:p-6",
                (current ? isCurrent : plan.featured) ? "gt-studio-b-plan--featured" : "border-[var(--border-subtle)]",
              )}
            >
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[length:var(--text-h4)]">{name}</h3>
                  {isCurrent ? (
                    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-inverse)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-inverse)]">
                      <CircleCheck size={12} aria-hidden="true" />
                      {t("studioPage.plans.current")}
                    </span>
                  ) : plan.featured && !current && (
                    <span className="rounded-[var(--radius-pill)] bg-[var(--gt-emerald-300)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)]">
                      {t("studioPage.plans.featured")}
                    </span>
                  )}
                </div>
                <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t(`studioPage.plans.items.${plan.id}`)}</p>
              </div>

              {price ? (
                <p className="m-0 flex items-baseline gap-1.5 text-[var(--text-primary)]">
                  <span className="text-[clamp(34px,8vw,42px)] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)]">
                    {formatMoney(price.amountMinor, price.currency)}
                  </span>
                  <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)]">
                    {t(interval === "month" ? "studioPage.plans.perMonth" : "studioPage.plans.perYear")}
                  </span>
                </p>
              ) : (
                <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)]">{t("studioPage.plans.unavailable")}</p>
              )}

              {isCurrent ? (
                <Button variant="outline" size="lg" fullWidth iconLeft={CircleCheck} disabled>
                  {t("studioPage.plans.currentCta")}
                </Button>
              ) : (
                <Button
                  variant={plan.featured && !current ? "primary" : "outline"}
                  size="lg"
                  fullWidth
                  iconRight={ArrowRight}
                  disabled={!price || locked}
                  onClick={() => onChoose(plan.id, interval, price)}
                  className={clsx(plan.featured && !current && "gt-studio-cta")}
                >
                  {t(current ? "studioPage.plans.switchCta" : "studioPage.plans.cta", { plan: name })}
                </Button>
              )}

              <PlanFeatureList plan={plan.id} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The plan below, whose features this one builds on ("Everything in Essential, plus:"). */
const PREVIOUS_PLAN: Partial<Record<StudioPaidPlanId, StudioPaidPlanId>> = { artist: "essential", atelier: "artist" };

/** The features a card names, in its order, when the plan has them and the one below does not. */
const ADDED_FEATURES: readonly StudioFeature[] = ["ownLogo", "transparentExport", "templates", "collections", "glowbook", "tryOn", "postLayouts"];

/**
 * What a plan includes, from `STUDIO_PLAN_FEATURES` (decision 113): Essential
 * lists its whole offer, the plans above say what they add to the one below.
 */
function PlanFeatureList({ plan }: { plan: StudioPaidPlanId }) {
  const { t } = useTranslation();
  const k = "studioPage.plans.features";
  const f = STUDIO_PLAN_FEATURES[plan];
  const previous = PREVIOUS_PLAN[plan] ?? null;

  const lines: string[] = [];
  if (f.creations === null && f.gemGroups === null) lines.push(t(`${k}.unlimited`));
  else {
    if (f.creations !== null) lines.push(t(`${k}.creations`, { count: f.creations }));
    if (f.gemGroups !== null) lines.push(t(`${k}.gemGroups`, { count: f.gemGroups }));
  }
  if (!previous) lines.push(t(`${k}.library`), t(`${k}.tools`), t(`${k}.watermark`));
  for (const feature of ADDED_FEATURES) {
    if (hasFeature(plan, feature) && !hasFeature(previous, feature)) lines.push(t(`${k}.${feature}`));
  }

  return (
    <div className="grid gap-2.5 border-t border-[var(--border-subtle)] pt-4">
      <span className="text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
        {previous ? t(`${k}.plus`, { plan: t(`studio.plans.items.${previous}.name`) }) : t(`${k}.title`)}
      </span>
      <ul className="m-0 grid list-none gap-2 p-0">
        {lines.map((line) => (
          <li key={line} className="flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--status-success-fg)]" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
