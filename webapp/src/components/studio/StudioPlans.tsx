"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { ArrowRight, Check, CircleAlert, Gift } from "lucide-react";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { TermsNotice } from "../auth/TermsNotice";
import { useStudioCheckout, type StudioCheckoutSurface } from "./access/useStudioCheckout";
import { Link, useNavigate } from "../../lib/navigation";
import { useAuth } from "../../lib/auth";
import { RETURN_PARAM, SIGN_IN_PATH } from "../../lib/authRoutes";
import { STUDIO_SUBSCRIBE_PATH } from "../../lib/studioUrl";
import { useFormat } from "../../lib/format";
import { useStudioPlanPrices } from "../../lib/studioBilling";
import { displayPrice, monthsFreeOf, type StudioPlanPrice } from "../../lib/studioBillingMapping";
import { STUDIO_PLANS, type StudioBillingInterval, type StudioPaidPlanId, type StudioPlan } from "../../data/studio";

/** The member's subscription page (`app/compte/(space)/studio`). */
export const ACCOUNT_STUDIO_PATH = "/compte/studio";

export type ChooseStudioPlan =(plan: StudioPaidPlanId, interval: StudioBillingInterval, price: StudioPlanPrice | null) => void;

/**
 * The Studio's offers in the alternative page's dress: the free trial as an
 * introductory banner, then the three paid plans side by side.
 *
 * Plan names, amounts and the trial's length are the project's own
 * (`data/studio.ts`, `studio_plan_prices`, `studio.plans.items.*.name`) — this
 * page invents none of them. Every paid plan opens the whole Studio (decision
 * 94). Nothing is bought here: the trial opens the Studio (`onTrial`) and a
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
 * The paid plans wired to the checkout: a signed-in member goes to Stripe's
 * payment page; a visitor is asked to sign in first (the subscription belongs
 * to an account) and comes back to the subscription page. Refusals are said
 * here: terms to accept (accepted in place, then the checkout opens), a
 * subscription already running (managed from the account), Stripe unavailable.
 *
 * Above the plans, unticked by default, the member's request for immediate
 * access (decision 94 (a), L221-25): a plan button pressed without it focuses
 * the box and says why; the function refuses a checkout without it and records
 * it (`consent_records`, same sentence as `STUDIO_WITHDRAWAL_CONSENT`).
 */
export function StudioCheckoutPlans({ surface }: { surface: StudioCheckoutSurface }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signedIn, acceptTerms } = useAuth();
  const checkout = useStudioCheckout(surface);
  const last = useRef<Parameters<ChooseStudioPlan> | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [termsFailed, setTermsFailed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const consentRef = useRef<HTMLInputElement>(null);
  const consentHintId = useId();
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (checkout.error) errorRef.current?.focus();
  }, [checkout.error]);

  const choose: ChooseStudioPlan = (plan, interval, price) => {
    if (!signedIn) {
      navigate(`${SIGN_IN_PATH}?${new URLSearchParams({ [RETURN_PARAM]: STUDIO_SUBSCRIBE_PATH })}`);
      return;
    }
    if (!consent) {
      setConsentMissing(true);
      consentRef.current?.focus();
      return;
    }
    last.current = [plan, interval, price];
    void checkout.start(plan, interval, price, true);
  };

  const changeConsent = (checked: boolean) => {
    setConsent(checked);
    if (checked) setConsentMissing(false);
    if (checked && checkout.error === "withdrawal_consent_required") checkout.clearError();
  };

  const acceptAndRetry = async () => {
    setAccepting(true);
    setTermsFailed(false);
    const done = await acceptTerms("checkout");
    setAccepting(false);
    if (!done) {
      setTermsFailed(true);
      return;
    }
    if (last.current) void checkout.start(...last.current, consent);
  };

  const error = checkout.error;
  return (
    <div className="grid gap-4">
      {signedIn && (
        <div
          className={clsx(
            "mx-auto grid w-full max-w-[680px] gap-2 rounded-[var(--radius-lg)] border bg-[var(--surface-card)] p-4",
            consentMissing ? "border-[var(--status-error-fg)]" : "border-[var(--border-subtle)]",
          )}
        >
          <Checkbox
            label={t("studio.access.checkout.consent.label")}
            checked={consent}
            onChange={changeConsent}
            inputRef={consentRef}
            invalid={consentMissing}
            describedBy={consentMissing ? consentHintId : undefined}
          />
          {consentMissing && (
            <p id={consentHintId} className="m-0 inline-flex items-center gap-1.5 pl-8 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
              <CircleAlert size={13} aria-hidden="true" />
              {t("studio.access.checkout.consent.required")}
            </p>
          )}
        </div>
      )}
      <StudioPaidPlans onChoose={choose} busy={checkout.pending} />
      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="mx-auto grid w-full max-w-[680px] gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-primary)] outline-none"
        >
          <strong className="inline-flex items-center gap-2">
            <CircleAlert size={15} aria-hidden="true" className="text-[var(--status-error-fg)]" />
            {t("studio.access.checkout.title")}
          </strong>
          <p className="m-0">{t(`studio.access.checkout.errors.${error}`)}</p>
          {error === "terms_required" && (
            <TermsNotice cta={t("studio.access.checkout.termsCta")} busy={accepting} failed={termsFailed} onAccept={() => void acceptAndRetry()} />
          )}
          {error === "already_subscribed" && (
            <Link to={ACCOUNT_STUDIO_PATH} className="w-fit font-semibold underline underline-offset-2">
              {t("studio.access.checkout.manage")}
            </Link>
          )}
          {(error === "session_expired" || error === "sign_in_required") && (
            <Link to={`${SIGN_IN_PATH}?${new URLSearchParams({ [RETURN_PARAM]: STUDIO_SUBSCRIBE_PATH })}`} className="w-fit font-semibold underline underline-offset-2">
              {t("studio.access.signedOut.signIn")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The three paid plans as cards, billed monthly or yearly (the switch above
 * them), each with its own call to action. Shared by the presentation page,
 * the subscription page and the Studio's locked screen (`StudioAccessGate`),
 * so all show the same plans. Amounts are the live Stripe prices
 * (`studio_plan_prices`) once read, the confirmed display values before.
 * `busy` is the "plan:interval" whose checkout is opening.
 */
export function StudioPaidPlans({ onChoose, busy = null }: { onChoose: ChooseStudioPlan; busy?: string | null }) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const live = useStudioPlanPrices();
  const [interval, setInterval] = useState<StudioBillingInterval>("month");
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
          const opening = busy === `${plan.id}:${interval}`;
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

              <Button
                variant={plan.featured ? "primary" : "outline"}
                size="lg"
                fullWidth
                iconRight={ArrowRight}
                loading={opening}
                disabled={!price || busy !== null}
                onClick={() => onChoose(plan.id, interval, price)}
                className={clsx(plan.featured && "gt-studio-cta")}
              >
                {opening ? t("studioPage.plans.redirecting") : t("studioPage.plans.cta", { plan: name })}
              </Button>

              <div className="grid gap-1.5 rounded-[var(--radius-md)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] p-3.5">
                <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-blue-700)]">
                  <Check size={12} aria-hidden="true" />
                  {t("studioPage.plans.detailsTitle")}
                </span>
                <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{t("studioPage.plans.details")}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
