import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../../lib/navigation";
import {
  ArrowUpRight,
  Banknote,
  CreditCard,
  ExternalLink,
  Gift,
  GraduationCap,
  Mail,
  MapPin,
  Package,
  Phone,
  RotateCcw,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/Button";
import { OrderLineThumb } from "../account/OrderLineThumb";
import { Badge, type BadgeTone } from "../ui/Badge";
import {
  customerInitials,
  customerName,
  orderItemCount,
  parseInstant,
  shortReference,
  type AdminOrder,
} from "../../data/adminOrders";
import type { OrderAddress, OrderParcel, OrderRefund } from "../../data/orders";
import { countryLabelKey } from "../../data/countries";
import { useFormat } from "../../lib/format";
import { pick } from "../../data/types";
import { PaymentStatusBadge } from "./StatusBadges";

/**
 * The cards of the order detail page.
 *
 * Every figure is the one the database recorded for this order — lines,
 * discounts, VAT, shipping, gift cards, refunds — in the order's own currency.
 * Nothing is recomputed here: a total the page rebuilt could disagree with
 * the one the customer paid, and that is the figure a dispute is about.
 */

export function Card({
  title,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[length:var(--text-h4)]">
          {Icon && <Icon size={15} aria-hidden="true" className="text-[var(--text-muted)]" />}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Label/value pair. `mono` for references a human reads back over the phone. */
function Field({ label, value, mono, title }: { label: string; value: ReactNode; mono?: boolean; title?: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
        {label}
      </dt>
      <dd
        title={title}
        className={`m-0 break-words text-[length:var(--text-body-sm)] text-[var(--text-primary)] ${mono ? "font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Formatting helpers bound to the order's currency and the UI language. */
function useOrderFormat(order: AdminOrder) {
  const { formatMoney, formatDateShort, locale } = useFormat();
  return {
    money: (minor: number) => formatMoney(minor, order.currency),
    day: (iso: string) => formatDateShort(iso),
    instant: (iso: string) =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parseInstant(iso)),
    /** Basis points as a percentage: 2000 → "20", 550 → "5,5". */
    rate: (bp: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bp / 100),
  };
}

/* -------------------------------------------------------------------------- */

export function CustomerCard({ order, onViewOrders }: { order: AdminOrder; onViewOrders: () => void }) {
  const { formatMonthYear, formatMoney } = useFormat();
  const { t } = useTranslation();
  const { customer } = order;
  const returning = customer.orderCount > 1;
  const guest = customer.id.startsWith("guest:");

  return (
    <Card
      title={t("admin.orders.customerTitle")}
      icon={UserRound}
      action={
        returning ? (
          <Button size="sm" variant="ghost" iconRight={ArrowUpRight} onClick={onViewOrders}>
            {t("admin.orders.customerOrders")}
          </Button>
        ) : undefined
      }
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-12 w-12 flex-none place-items-center rounded-full bg-[var(--surface-brand)] text-[length:var(--text-body-sm)] font-[var(--weight-black)] text-[var(--gt-ink-900)]"
        >
          {customerInitials(customer)}
        </span>
        <div className="grid min-w-0 gap-0.5">
          <strong className="truncate text-[length:var(--text-body-md)] text-[var(--text-primary)]">
            {customerName(customer)}
          </strong>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={returning ? "brand" : "neutral"} size="sm">
              {returning ? t("admin.orders.customerReturning", { count: customer.orderCount }) : t("admin.orders.customerFirstOrder")}
            </Badge>
            {guest && (
              <Badge tone="neutral" size="sm">
                {t("admin.orders.customerGuest")}
              </Badge>
            )}
          </span>
        </div>
      </div>

      <dl className="m-0 grid gap-3 sm:grid-cols-2">
        <Field
          label={t("admin.orders.customerEmail")}
          value={
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-1.5 break-all underline decoration-1 underline-offset-4 hover:text-[var(--accent-highlight-ink)]"
            >
              <Mail size={13} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
              {customer.email}
            </a>
          }
        />
        <Field
          label={t("admin.orders.customerPhone")}
          value={
            customer.phone ? (
              <a
                href={`tel:${customer.phone.replace(/\s/g, "")}`}
                className="flex items-center gap-1.5 underline decoration-1 underline-offset-4 hover:text-[var(--accent-highlight-ink)]"
              >
                <Phone size={13} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
                {customer.phone}
              </a>
            ) : (
              "—"
            )
          }
        />
        <Field label={t("admin.orders.customerSince")} value={formatMonthYear(customer.since)} />
        <Field
          label={t("admin.orders.customerLifetime")}
          value={
            customer.spend.length === 0 ? (
              "—"
            ) : (
              <span className="grid tabular-nums">
                {customer.spend.map((s) => (
                  <span key={s.currency}>{formatMoney(s.amount, s.currency)}</span>
                ))}
              </span>
            )
          }
        />
      </dl>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

export function ItemsCard({ order }: { order: AdminOrder }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const f = useOrderFormat(order);
  const { amounts } = order;

  return (
    <Card title={t("admin.orders.itemsTitle")} icon={Truck} className="lg:col-span-2">
      <ul className="m-0 grid list-none gap-0 p-0">
        {order.lines.map((line) => {
          const to = line.productId ? `/boutique/${line.productId}` : line.courseId ? `/academy/formation/${line.courseId}` : null;
          const name = pick(line.name, lang);
          return (
            <li
              key={line.id}
              className="flex flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] py-3 first:pt-0 last:border-b-0 last:pb-0"
            >
              {line.giftCardDesign ? (
                <OrderLineThumb line={line} size={56} />
              ) : (
              <span className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                {line.courseId ? (
                  <GraduationCap size={20} className="text-[var(--gt-blue-700)]" aria-hidden="true" />
                ) : line.image ? (
                  <img src={line.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <Package size={20} className="text-[var(--text-subtle)]" aria-hidden="true" />
                )}
              </span>
              )}

              <span className="grid min-w-[140px] flex-1 gap-0.5">
                {to ? (
                  <Link
                    to={to}
                    className="w-fit text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 hover:text-[var(--accent-highlight-ink)]"
                  >
                    {name}
                  </Link>
                ) : (
                  <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{name}</span>
                )}
                {line.variant && (
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{pick(line.variant, lang)}</span>
                )}
                <span className="text-[11px] text-[var(--text-subtle)]">
                  {t("admin.orders.itemsVat", { rate: f.rate(line.taxRateBp), amount: f.money(line.taxAmount) })}
                </span>
              </span>

              <span className="grid w-[64px] flex-none text-right">
                <span className="text-[11px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
                  {t("admin.orders.itemsQty")}
                </span>
                <span className="tabular-nums text-[var(--text-primary)]">×{line.qty}</span>
              </span>

              <span className="grid w-[84px] flex-none text-right">
                <span className="text-[11px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
                  {t("admin.orders.itemsUnitPrice")}
                </span>
                <span className="tabular-nums text-[var(--text-body)]">{f.money(line.unitAmount)}</span>
              </span>

              <span className="grid w-[104px] flex-none text-right">
                <span className="text-[11px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
                  {t("admin.orders.itemsLineTotal")}
                </span>
                <span className="font-semibold tabular-nums text-[var(--text-primary)]">{f.money(line.totalAmount)}</span>
                {line.discountAmount > 0 && (
                  <span className="text-[11px] tabular-nums text-[var(--status-success-fg)]">
                    {t("admin.orders.itemsLineDiscount", { amount: f.money(line.discountAmount) })}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {/* The financial summary, as recorded. The total gets the heavier weight
          and its own rule: it is what a dispute is about. */}
      <dl className="m-0 ml-auto grid w-full max-w-[360px] gap-2">
        <SummaryRow label={t("admin.orders.summarySubtotal", { count: orderItemCount(order) })} value={f.money(amounts.subtotal)} />
        {order.discounts.map((d, index) => (
          <SummaryRow
            key={`${d.label}-${index}`}
            label={
              d.source === "loyalty"
                ? t("admin.orders.summaryDiscountLoyalty", { label: d.label })
                : d.code
                  ? t("admin.orders.summaryDiscountCode", { code: d.code, label: d.label })
                  : t("admin.orders.summaryDiscountLabel", { label: d.label })
            }
            value={`− ${f.money(d.goodsAmount + d.shippingAmount)}`}
            tone="good"
          />
        ))}
        {order.discounts.length === 0 && amounts.discount > 0 && (
          <SummaryRow label={t("admin.orders.summaryDiscount")} value={`− ${f.money(amounts.discount)}`} tone="good" />
        )}
        {order.shippingMethod !== "digital" && (
          <SummaryRow
            label={t("admin.orders.summaryShipping")}
            value={amounts.shipping === 0 ? t("admin.orders.summaryShippingFree") : f.money(amounts.shipping)}
          />
        )}
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t-2 border-[var(--gt-ink-900)] pt-2.5">
          <dt className="text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)]">
            {t("admin.orders.summaryTotal")}
          </dt>
          <dd className="m-0 text-[length:var(--text-h3)] font-[var(--weight-black)] tabular-nums leading-none text-[var(--text-primary)]">
            {f.money(amounts.total)}
          </dd>
        </div>
        {order.taxes.map((tax) => (
          <SummaryRow
            key={tax.rateBp ?? "shipping"}
            label={
              tax.rateBp === null
                ? t(amounts.taxIncluded ? "admin.orders.summaryTaxShipping" : "admin.orders.summaryTaxShippingAdded")
                : t(amounts.taxIncluded ? "admin.orders.summaryTax" : "admin.orders.summaryTaxAdded", { rate: f.rate(tax.rateBp) })
            }
            value={f.money(tax.amount)}
            muted
          />
        ))}
        {order.giftCards.map((card, index) => (
          <SummaryRow
            key={`gift-${index}`}
            label={card.last4 ? t("admin.orders.summaryGiftCard", { last4: card.last4 }) : t("admin.orders.summaryGiftCardNoCode")}
            value={`− ${f.money(card.amount)}`}
          />
        ))}
        {amounts.giftCard > 0 && (
          <SummaryRow label={t("admin.orders.summaryCharged")} value={f.money(amounts.charged)} />
        )}
        {amounts.refunded > 0 && (
          <SummaryRow label={t("admin.orders.summaryRefunded")} value={`− ${f.money(amounts.refunded)}`} tone="bad" />
        )}
      </dl>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  muted?: boolean;
}) {
  const color =
    tone === "good"
      ? "text-[var(--status-success-fg)]"
      : tone === "bad"
        ? "text-[var(--status-error-fg)]"
        : muted
          ? "text-[var(--text-muted)]"
          : "text-[var(--text-primary)]";
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={`text-[length:var(--text-body-sm)] ${muted ? "text-[var(--text-subtle)]" : "text-[var(--text-muted)]"}`}>
        {label}
      </dt>
      <dd className={`m-0 whitespace-nowrap text-[length:var(--text-body-sm)] tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function AddressBlock({ address }: { address: OrderAddress }) {
  const { t } = useTranslation();
  return (
    <address className="not-italic leading-[var(--leading-normal)]">
      {address.name && <span className="block font-semibold">{address.name}</span>}
      {address.company && <span className="block">{address.company}</span>}
      {address.lines.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
      <span className="block">{[address.postalCode, address.city].filter(Boolean).join(" ")}</span>
      {address.region && <span className="block">{address.region}</span>}
      {address.countryCode && <span className="block">{t(countryLabelKey(address.countryCode.toLowerCase()))}</span>}
      {address.phone && <span className="block text-[var(--text-muted)]">{address.phone}</span>}
    </address>
  );
}

const PARCEL_TONE: Record<OrderParcel["status"], BadgeTone> = {
  preparing: "neutral",
  shipped: "brand",
  delivered: "success",
  returned: "warning",
  lost: "error",
  cancelled: "neutral",
};

export function ShippingCard({ order }: { order: AdminOrder }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const f = useOrderFormat(order);
  const digital = order.shippingMethod === "digital";
  const lineName = (id: string) => {
    const line = order.lines.find((l) => l.id === id);
    return line ? pick(line.name, lang) + (line.variant ? ` — ${pick(line.variant, lang)}` : "") : "—";
  };

  return (
    <Card title={t("admin.orders.shippingTitle")} icon={MapPin}>
      {digital && (
        <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-3 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]">
          <GraduationCap size={15} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("admin.orders.shippingDigital")}
        </p>
      )}

      <dl className="m-0 grid gap-3 sm:grid-cols-2">
        {order.shippingAddress && (
          <Field label={t("admin.orders.shippingAddressTitle")} value={<AddressBlock address={order.shippingAddress} />} />
        )}
        {order.billingAddress && (
          <Field label={t("admin.orders.billingAddressTitle")} value={<AddressBlock address={order.billingAddress} />} />
        )}
        {order.attention === "addressIncomplete" && (
          <p className="m-0 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-2.5 text-[length:var(--text-caption)] text-[var(--status-warning-fg)] sm:col-span-2">
            <ShieldCheck size={13} aria-hidden="true" className="mt-0.5 flex-none" />
            {t("admin.orders.shippingAddressFlag")}
          </p>
        )}
      </dl>

      {!digital && (
        <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4">
          <dl className="m-0 grid gap-3 sm:grid-cols-2">
            <Field label={t("admin.orders.shippingMethodLabel")} value={order.shippingMethodName ?? "—"} />
            {order.parcels.length === 0 && (
              <Field label={t("admin.orders.shippingTracking")} value={t("admin.orders.shippingNotShippedYet")} />
            )}
          </dl>

          {order.parcels.length > 0 && (
            <ol className="m-0 grid list-none gap-3 p-0">
              {order.parcels.map((parcel, index) => (
                <li key={parcel.id} className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="flex items-center gap-1.5 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                      <Package size={14} aria-hidden="true" className="text-[var(--text-muted)]" />
                      {t("admin.orders.parcelTitle", { n: index + 1 })}
                    </strong>
                    <Badge tone={PARCEL_TONE[parcel.status]} size="sm">
                      {t(`admin.orders.parcelStatus.${parcel.status}`)}
                    </Badge>
                  </span>
                  <dl className="m-0 grid gap-2 sm:grid-cols-2">
                    {parcel.carrier && (
                      <Field
                        label={t("admin.orders.shippingCarrier")}
                        value={parcel.service ? `${parcel.carrier} · ${parcel.service}` : parcel.carrier}
                      />
                    )}
                    {parcel.trackingNumber && (
                      <Field
                        label={t("admin.orders.shippingTracking")}
                        mono
                        value={
                          parcel.trackingUrl ? (
                            <a
                              href={parcel.trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 underline decoration-1 underline-offset-4 hover:text-[var(--accent-highlight-ink)]"
                            >
                              {parcel.trackingNumber}
                              <ExternalLink size={12} aria-hidden="true" />
                              <span className="sr-only">{t("admin.orders.trackShipmentNewTab")}</span>
                            </a>
                          ) : (
                            parcel.trackingNumber
                          )
                        }
                      />
                    )}
                    {parcel.shippedOn && <Field label={t("admin.orders.parcelShippedOn")} value={f.day(parcel.shippedOn)} />}
                    {parcel.deliveredOn ? (
                      <Field label={t("admin.orders.parcelDeliveredOn")} value={f.day(parcel.deliveredOn)} />
                    ) : (
                      parcel.estimatedDelivery && <Field label={t("admin.orders.shippingEta")} value={f.day(parcel.estimatedDelivery)} />
                    )}
                  </dl>
                  {parcel.items.length > 0 && (
                    <div className="grid gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
                        {t("admin.orders.parcelContents")}
                      </span>
                      <ul className="m-0 grid list-none gap-0.5 p-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
                        {parcel.items.map((item) => (
                          <li key={item.lineId}>
                            <span className="tabular-nums">{item.qty} ×</span> {lineName(item.lineId)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

export function PaymentCard({ order }: { order: AdminOrder }) {
  const { t } = useTranslation();
  const f = useOrderFormat(order);
  const { payment } = order;
  const card = payment.method === "visa" || payment.method === "mastercard" || payment.method === "card";
  const charged = order.amounts.charged > 0;

  return (
    <Card title={t("admin.orders.paymentTitle")} icon={CreditCard}>
      <dl className="m-0 grid gap-3 sm:grid-cols-2">
        <Field label={t("admin.orders.paymentStatusLabel")} value={<PaymentStatusBadge status={payment.status} size="sm" />} />
        {charged && (
          <Field
            label={t("admin.orders.paymentMethod")}
            value={
              <span className="flex items-center gap-2">
                {card ? (
                  <CreditCard size={14} aria-hidden="true" className="text-[var(--text-muted)]" />
                ) : (
                  <Banknote size={14} aria-hidden="true" className="text-[var(--text-muted)]" />
                )}
                {/* Masked, always: four digits is all the provider sends and all a back office needs. */}
                {payment.last4
                  ? `${t(`admin.orders.paymentMethods.${payment.method}`)} •••• ${payment.last4}`
                  : t(`admin.orders.paymentMethods.${payment.method}`)}
              </span>
            }
          />
        )}
        {charged && (
          <Field
            label={t("admin.orders.paymentReference")}
            value={payment.reference ? shortReference(payment.reference) : "—"}
            title={payment.reference}
            mono
          />
        )}
        <Field
          label={t("admin.orders.paymentDate")}
          value={payment.capturedAt ? f.instant(payment.capturedAt) : t("admin.orders.paymentNotCaptured")}
        />
        {charged && (
          <Field
            label={t("admin.orders.paymentAmount")}
            value={<span className="font-semibold tabular-nums">{f.money(payment.captured)}</span>}
          />
        )}
        {payment.refunded > 0 && (
          <Field
            label={t("admin.orders.paymentRefunded")}
            value={<span className="font-semibold tabular-nums text-[var(--status-error-fg)]">{f.money(payment.refunded)}</span>}
          />
        )}
        {order.giftCards.length > 0 && (
          <Field
            label={t("admin.orders.paymentGiftCards")}
            value={
              <span className="grid gap-0.5">
                {order.giftCards.map((g, index) => (
                  <span key={index} className="flex items-center gap-1.5 tabular-nums">
                    <Gift size={13} aria-hidden="true" className="text-[var(--text-muted)]" />
                    {g.last4 ? `•••• ${g.last4}` : t("admin.orders.summaryGiftCardNoCode")} · {f.money(g.amount)}
                    {g.status === "refunded" && ` (${t("admin.orders.giftCardCredited")})`}
                  </span>
                ))}
              </span>
            }
          />
        )}
      </dl>

      {payment.status === "failed" && (
        <p className="m-0 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-2.5 text-[length:var(--text-caption)] text-[var(--status-error-fg)]">
          <CreditCard size={13} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("admin.orders.paymentFailedNote")}
        </p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

const REFUND_TONE: Record<OrderRefund["status"], BadgeTone> = {
  pending: "warning",
  succeeded: "success",
  failed: "error",
  cancelled: "neutral",
};

/** Refunds recorded on the order (requested by staff, confirmed by the payment provider's webhook). */
export function RefundsCard({ order }: { order: AdminOrder }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const f = useOrderFormat(order);
  if (order.refunds.length === 0) return null;

  return (
    <Card title={t("admin.orders.refundsTitle")} icon={RotateCcw}>
      <ul className="m-0 grid list-none gap-3 p-0">
        {order.refunds.map((refund, index) => (
          <li key={index} className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <strong className="tabular-nums text-[var(--text-primary)]">{f.money(refund.amount)}</strong>
              <Badge tone={REFUND_TONE[refund.status]} size="sm">
                {t(`admin.orders.refundStatus.${refund.status}`)}
              </Badge>
            </span>
            <dl className="m-0 grid gap-2 sm:grid-cols-2">
              <Field label={t("admin.orders.refundReasonLabel")} value={t(`admin.orders.refundReason.${refund.reason}`)} />
              <Field label={t("admin.orders.refundRequestedOn")} value={f.day(refund.requestedOn)} />
              {refund.processedOn && <Field label={t("admin.orders.refundProcessedOn")} value={f.day(refund.processedOn)} />}
            </dl>
            {refund.items.length > 0 && (
              <ul className="m-0 grid list-none gap-0.5 p-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
                {refund.items.map((item) => {
                  const line = order.lines.find((l) => l.id === item.lineId);
                  return (
                    <li key={item.lineId}>
                      <span className="tabular-nums">{item.qty} ×</span> {line ? pick(line.name, lang) : "—"}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
