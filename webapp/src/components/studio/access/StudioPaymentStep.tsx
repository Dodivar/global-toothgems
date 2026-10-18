"use client";

import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Check, CircleAlert, CreditCard, Lock, RefreshCcw, ShieldCheck } from "lucide-react";
import { Checkbox } from "../../ui/Checkbox";
import { StripePaymentForm } from "../../checkout/StripePaymentForm";
import { Link } from "../../../lib/navigation";
import { useFormat } from "../../../lib/format";
import { trackStudio } from "../../../lib/studioAnalytics";
import type { StudioCheckoutError, StudioConsentAnswer, StudioPayment } from "../../../lib/studioBillingMapping";
import type { StudioCheckoutQuery } from "../../../lib/studioUrl";

/**
 * The Studio subscription's payment step, the body of the checkout page
 * (`screens/StudioCheckout.tsx`): what is being bought, the request for
 * immediate access, and the shop's payment form (`StripePaymentForm`, same look
 * and states).
 *
 * The request (decision 94 (a), L221-25) is a box beside the form, unticked by
 * default: Pay without it focuses the box and says why; with it, the request is
 * recorded by `create-studio-subscription` first and the payment is confirmed
 * only once it is. Same sentence as `STUDIO_WITHDRAWAL_CONSENT`
 * (`studio.access.checkout.consent.label`, checked by `studioBilling_test.ts`).
 *
 * Loaded lazily: Stripe.js is fetched only once a plan is chosen.
 */

interface StudioPaymentStepProps {
  query: StudioCheckoutQuery;
  payment: StudioPayment;
  locale: "fr" | "en";
  recordConsent: () => Promise<StudioConsentAnswer>;
  onPaid: () => void;
  onRestart: () => void;
}

export default function StudioPaymentStep({ query, payment, locale, recordConsent, onPaid, onRestart }: StudioPaymentStepProps) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const { plan, interval, surface } = query;
  const [consent, setConsent] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const [error, setError] = useState<StudioCheckoutError | null>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const consentHintId = useId();
  const amount = formatMoney(payment.amountMinor, payment.currency);
  const name = t(`studio.plans.items.${plan}.name`);

  const changeConsent = (checked: boolean) => {
    setConsent(checked);
    if (checked) setConsentMissing(false);
  };

  // Pay pressed: the request must be ticked, then recorded, before Stripe is asked to charge.
  const beforeConfirm = async () => {
    setError(null);
    if (!consent) {
      setConsentMissing(true);
      consentRef.current?.focus();
      return false;
    }
    const answer = await recordConsent();
    if (answer.kind === "consented") return true;
    trackStudio("studio_checkout_failed", { plan_id: plan, interval, price_minor: payment.amountMinor, currency: payment.currency, surface, reason: answer.error });
    setError(answer.error);
    return false;
  };

  return (
    <div className="gt-step-in mx-auto grid w-full max-w-[1040px] gap-5">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* What is bought: first on a phone, beside the form from 1024px. */}
        <aside className="grid content-start gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)] lg:sticky lg:top-24 lg:order-2">
          <h2 className="text-[length:var(--text-h4)]">{t("studio.access.payment.summaryTitle")}</h2>
          <div className="grid gap-1">
            <strong className="text-[length:var(--text-body-lg)] text-[var(--text-primary)]">{t("studio.access.payment.planName", { plan: name })}</strong>
            <span className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t(`studioPage.plans.items.${plan}`)}</span>
          </div>
          <dl className="m-0 grid gap-2 border-t border-[var(--border-subtle)] pt-4 text-sm">
            <div className="flex justify-between gap-3 text-[var(--text-body)]">
              <dt>{t("studio.access.payment.billing")}</dt>
              <dd className="m-0 text-right">{t(interval === "month" ? "studioPage.plans.monthly" : "studioPage.plans.yearly")}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-3">
              <dt className="text-base font-bold text-[var(--text-primary)]">{t("studio.access.payment.dueToday")}</dt>
              <dd className="m-0 text-xl font-bold text-[var(--text-primary)]">{amount}</dd>
            </div>
            <p className="m-0 text-xs text-[var(--text-muted)]">{t("checkout.payment.vatIncluded")}</p>
          </dl>
          <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] px-3 py-2.5 text-xs text-[var(--gt-blue-700)]">
            <RefreshCcw size={14} aria-hidden="true" className="mt-0.5 flex-none" />
            {t(interval === "month" ? "studio.access.payment.renewsMonthly" : "studio.access.payment.renewsYearly", { amount })}
          </p>
          <ul className="m-0 grid list-none gap-1.5 p-0 text-xs text-[var(--text-body)]">
            {(["access", "cancel", "withdraw"] as const).map((key) => (
              <li key={key} className="flex items-start gap-2">
                <Check size={13} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-success-fg)]" />
                {t(`studio.access.payment.points.${key}`)}
              </li>
            ))}
          </ul>
        </aside>

        <section
          aria-labelledby="studio-payment-title"
          className="grid content-start gap-5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)] lg:order-1"
        >
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="studio-payment-title" className="flex items-center gap-2 text-[length:var(--text-h3)]">
                <Lock size={20} aria-hidden="true" className="flex-none" />
                {t("checkout.payment.title")}
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-success-bg)] px-3 py-1 text-xs font-semibold text-[var(--status-success-fg)]">
                <ShieldCheck size={14} aria-hidden="true" />
                {t("checkout.payment.secureBadge")}
              </span>
            </div>
            <p className="m-0 text-sm text-[var(--text-body)]">{t("studio.access.payment.intro")}</p>
          </div>

          <StripePaymentForm
            clientSecret={payment.clientSecret}
            publishableKey={payment.publishableKey}
            expiresAt={payment.expiresAt}
            locale={locale}
            payLabel={t("studio.access.payment.pay", { amount })}
            beforeConfirm={beforeConfirm}
            onPaid={onPaid}
            onRestart={onRestart}
            footer={
              <p className="m-0 text-center text-xs leading-relaxed text-[var(--text-muted)]">
                {t("checkout.payment.consentBefore")}{" "}
                <Link to="/conditions-generales" target="_blank" className="underline decoration-1 underline-offset-2 hover:text-[var(--text-primary)]">
                  {t("checkout.payment.consentLink")}
                </Link>
                {t("checkout.payment.consentAfter")}
              </p>
            }
          >
            <div
              className={clsx(
                "grid gap-2 rounded-[var(--radius-lg)] border bg-[var(--surface-card)] p-4",
                consentMissing ? "border-[var(--status-error-fg)]" : "border-[var(--border-subtle)]",
              )}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                {t("studio.access.payment.consentTitle")}
              </span>
              <Checkbox
                label={t("studio.access.checkout.consent.label")}
                checked={consent}
                onChange={changeConsent}
                inputRef={consentRef}
                invalid={consentMissing}
                describedBy={consentMissing ? consentHintId : undefined}
              />
              {consentMissing && (
                <p id={consentHintId} role="alert" className="m-0 inline-flex items-center gap-1.5 pl-8 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
                  <CircleAlert size={13} aria-hidden="true" />
                  {t("studio.access.checkout.consent.required")}
                </p>
              )}
            </div>
            {error && (
              <div role="alert" className="grid gap-2 rounded-[var(--radius-md)] bg-[var(--status-error-bg)] px-4 py-3 text-sm font-medium text-[var(--status-error-fg)]">
                <p className="m-0 flex items-start gap-2">
                  <CircleAlert size={16} aria-hidden="true" className="mt-0.5 flex-none" />
                  {t(`studio.access.checkout.errors.${error}`)}
                </p>
                {error === "checkout_closed" && (
                  <button type="button" onClick={onRestart} className="w-fit bg-transparent p-0 pl-6 font-semibold underline underline-offset-2">
                    {t("checkout.payment.restart")}
                  </button>
                )}
              </div>
            )}
          </StripePaymentForm>

          <ul className="m-0 grid list-none gap-2 border-t border-[var(--border-subtle)] p-0 pt-4 text-xs text-[var(--text-muted)] sm:grid-cols-3">
            <Trust icon={Lock}>{t("checkout.payment.trustEncrypted")}</Trust>
            <Trust icon={ShieldCheck}>{t("checkout.payment.trust3ds")}</Trust>
            <Trust icon={CreditCard}>{t("checkout.payment.trustNoStorage")}</Trust>
          </ul>
          <p className="m-0 text-center text-[11px] text-[var(--text-subtle)]">{t("checkout.payment.poweredBy")}</p>
        </section>
      </div>
    </div>
  );
}

function Trust({ icon: Icon, children }: { icon: typeof Lock; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--status-success-fg)]" />
      <span>{children}</span>
    </li>
  );
}
