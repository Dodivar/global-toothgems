"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, CreditCard, Gift, GraduationCap, Lock, Mail, MapPin, PackageCheck, ShieldCheck, Truck } from "lucide-react";
import { countryLabelKey } from "../../data/countries";
import type { CartLine } from "../../lib/checkout/cartLines";
import type { CheckoutForm } from "../../lib/checkout/checkoutForm";
import type { PaymentStep as PaymentStepData } from "../../lib/checkout/api";
import type { ShippingOption } from "../../lib/checkout/shippingRates";
import { useFormat } from "../../lib/format";
import { GiftCardVisual } from "../promotions/Visuals";
import type { GiftCardDesign } from "../../lib/giftCards/giftCardMapping";

// Stripe.js and its React bindings are fetched only when a payment step opens.
const PaymentStep = lazy(() => import("./PaymentStep"));

/**
 * The last step of the checkout, on our own page: what the customer gave
 * (with a way back to change it), the secure payment form, and the order
 * summary with the amount the database computed. Amounts are minor units.
 */

export interface PaymentAmounts {
  subtotal: number;
  shipping: number;
  /** Loyalty reward discount shown in the cart (the database applied the same rule). */
  reward: number;
  rewardPercent: number;
  /** Total before gift cards, as the cart computed it. */
  total: number;
}

interface PaymentViewProps {
  payment: PaymentStepData;
  locale: "fr" | "en";
  lines: CartLine[];
  form: CheckoutForm;
  shipped: boolean;
  courseInBasket: boolean;
  shippingOption: ShippingOption | null;
  amounts: PaymentAmounts;
  giftCardCount: number;
  onEdit: () => void;
  onRestart: () => void;
}

export function PaymentView({
  payment,
  locale,
  lines,
  form,
  shipped,
  courseInBasket,
  shippingOption,
  amounts,
  giftCardCount,
  onEdit,
  onRestart,
}: PaymentViewProps) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const money = (minor: number) => formatMoney(minor, payment.currency);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // The step replaces the form in place: focus and scroll follow it.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Gift cards are applied by the database: what is left to pay is its amount.
  const giftCardsApplied = giftCardCount > 0 ? Math.max(0, amounts.total - payment.amountDue) : 0;
  const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
  const country = form.country.toUpperCase();

  const summary = (
    <div className="grid gap-4">
      <ul className="m-0 grid list-none gap-3 p-0">
        {lines.map((line) => (
          <li key={line.id} className="flex items-center gap-3">
            <span className="relative flex-none">
              {line.giftCard ? (
                <span className="block w-[72px]">
                  <GiftCardVisual design={line.giftCard.design as GiftCardDesign} amountCents={line.unitPrice} size="sm" label="" />
                </span>
              ) : line.courseId && !line.image ? (
                <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-[var(--radius-sm)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                  <GraduationCap size={20} />
                </span>
              ) : (
                <img src={line.image} alt="" loading="lazy" decoding="async" className="h-14 w-14 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] object-cover" />
              )}
              {line.qty > 1 && (
                <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--gt-ink-900)] px-1 text-[11px] font-semibold text-white">
                  {line.qty}
                  <span className="sr-only"> × </span>
                </span>
              )}
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <strong className="truncate text-sm text-[var(--text-primary)]">{line.name}</strong>
              {line.variant && <span className="truncate text-xs text-[var(--text-muted)]">{line.variant}</span>}
            </span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">{money(line.unitPrice * line.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="m-0 grid gap-2 border-t border-[var(--border-subtle)] pt-4 text-sm">
        <Row label={t("cart.subtotal")} value={money(amounts.subtotal)} />
        <Row
          label={t("cart.shipping")}
          value={
            !shipped
              ? courseInBasket
                ? t("checkout.course.noDelivery")
                : t("checkout.giftCard.emailDelivery")
              : amounts.shipping === 0
                ? t("cart.shippingFree")
                : money(amounts.shipping)
          }
          success={shipped && amounts.shipping === 0}
        />
        {amounts.reward > 0 && (
          <Row label={t("loyalty.checkout.summaryLine", { percent: amounts.rewardPercent })} value={`−${money(amounts.reward)}`} success />
        )}
        {giftCardsApplied > 0 && <Row label={t("checkout.payment.giftCards", { count: giftCardCount })} value={`−${money(giftCardsApplied)}`} success />}
        <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-3">
          <dt className="text-base font-bold text-[var(--text-primary)]">{t("checkout.payment.due")}</dt>
          <dd className="m-0 text-xl font-bold text-[var(--text-primary)]">{money(payment.amountDue)}</dd>
        </div>
        <p className="m-0 text-xs text-[var(--text-muted)]">{t("checkout.payment.vatIncluded")}</p>
      </dl>
      <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] px-3 py-2.5 text-xs text-[var(--gt-blue-700)]">
        <PackageCheck size={14} aria-hidden="true" className="mt-0.5 flex-none" />
        {t("checkout.payment.reserved", { reference: payment.orderNumber })}
      </p>
    </div>
  );

  return (
    <div className="gt-step-in grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Mobile: the summary folds above the form, its total always in sight. */}
      <section className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] lg:hidden">
        <button
          type="button"
          aria-expanded={summaryOpen}
          aria-controls="payment-summary-mobile"
          onClick={() => setSummaryOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 bg-transparent p-[var(--space-5)] text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            {summaryOpen ? t("checkout.payment.hideSummary") : t("checkout.payment.showSummary")}
            <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${summaryOpen ? "rotate-180" : ""}`} />
          </span>
          <strong className="text-base text-[var(--text-primary)]">{money(payment.amountDue)}</strong>
        </button>
        {summaryOpen && (
          <div id="payment-summary-mobile" className="border-t border-[var(--border-subtle)] p-[var(--space-5)]">
            {summary}
          </div>
        )}
      </section>

      <div className="grid content-start gap-6">
        <section className="grid gap-1 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-[var(--space-6)] py-[var(--space-2)]">
          <h2 className="sr-only">{t("checkout.recap.title")}</h2>
          <RecapRow icon={Mail} label={t("checkout.recap.contact")} onEdit={onEdit} editLabel={t("checkout.recap.editContact")}>
            {form.email.trim()}
          </RecapRow>
          <RecapRow
            icon={MapPin}
            label={shipped ? t("checkout.recap.shipTo") : t("checkout.recap.billTo")}
            onEdit={onEdit}
            editLabel={t("checkout.recap.editAddress")}
          >
            {name}, {form.street.trim()}, {form.postalCode.trim()} {form.city.trim()}, {t(countryLabelKey(form.country))}
            <span className="sr-only"> ({country})</span>
          </RecapRow>
          {shipped ? (
            shippingOption && (
              <RecapRow icon={Truck} label={t("checkout.recap.method")} onEdit={onEdit} editLabel={t("checkout.recap.editMethod")}>
                {t(`checkout.shippingKind.${shippingOption.kind}`)} · {t("checkout.shippingDays", { min: shippingOption.minDays, max: shippingOption.maxDays })} ·{" "}
                <strong className="font-semibold">{shippingOption.price === 0 ? t("cart.shippingFree") : money(shippingOption.price)}</strong>
              </RecapRow>
            )
          ) : (
            <RecapRow icon={courseInBasket ? GraduationCap : Gift} label={t("checkout.recap.method")}>
              {t("checkout.noShipping")}
            </RecapRow>
          )}
        </section>

        <section aria-labelledby="payment-title" className="grid gap-5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)]">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="payment-title" ref={heading} tabIndex={-1} className="flex items-center gap-2 text-[length:var(--text-h3)] outline-none">
                <Lock size={20} aria-hidden="true" className="flex-none" />
                {t("checkout.payment.title")}
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-success-bg)] px-3 py-1 text-xs font-semibold text-[var(--status-success-fg)]">
                <ShieldCheck size={14} aria-hidden="true" />
                {t("checkout.payment.secureBadge")}
              </span>
            </div>
            <p className="m-0 text-sm text-[var(--text-body)]">{t("checkout.payment.intro")}</p>
          </div>

          <Suspense fallback={<div className="gt-skeleton h-[236px] rounded-[var(--radius-md)]" role="status" aria-label={t("checkout.payment.loading")} />}>
            <PaymentStep
              payment={payment}
              locale={locale}
              billing={{
                name,
                address: { line1: form.street.trim(), postal_code: form.postalCode.trim(), city: form.city.trim(), country },
              }}
              amountLabel={money(payment.amountDue)}
              onRestart={onRestart}
            />
          </Suspense>

          <ul className="m-0 grid list-none gap-2 border-t border-[var(--border-subtle)] p-0 pt-4 text-xs text-[var(--text-muted)] sm:grid-cols-3">
            <Trust icon={Lock}>{t("checkout.payment.trustEncrypted")}</Trust>
            <Trust icon={ShieldCheck}>{t("checkout.payment.trust3ds")}</Trust>
            <Trust icon={CreditCard}>{t("checkout.payment.trustNoStorage")}</Trust>
          </ul>
          <p className="m-0 text-center text-[11px] text-[var(--text-subtle)]">{t("checkout.payment.poweredBy")}</p>
        </section>
      </div>

      <aside className="hidden min-w-0 content-start gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-6)] shadow-[var(--shadow-xs)] lg:sticky lg:top-24 lg:grid">
        <h2 className="text-[length:var(--text-h4)]">{t("cart.summaryTitle")}</h2>
        {summary}
      </aside>
    </div>
  );
}

function Row({ label, value, success = false }: { label: string; value: string; success?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${success ? "text-[var(--status-success-fg)]" : "text-[var(--text-body)]"}`}>
      <dt>{label}</dt>
      <dd className={`m-0 text-right ${success ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

function RecapRow({
  icon: Icon,
  label,
  children,
  onEdit,
  editLabel,
}: {
  icon: typeof Mail;
  label: string;
  children: React.ReactNode;
  onEdit?: () => void;
  editLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] py-4 last:border-0">
      <Icon size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--text-muted)]" />
      <div className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-4">
        <span className="text-xs font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{label}</span>
        <span className="break-words text-sm text-[var(--text-primary)]">{children}</span>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel}
          className="flex-none bg-transparent p-0 text-xs font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-2 hover:text-[var(--gt-blue-700)]"
        >
          {t("checkout.recap.edit")}
        </button>
      )}
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
