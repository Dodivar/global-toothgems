import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CreditCard,
  GraduationCap,
  Mail,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Truck,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import {
  VAT_RATE,
  customerInitials,
  customerName,
  orderItemCount,
  orderSubtotal,
  orderTax,
  orderTotal,
  type AdminOrder,
} from "../../data/adminOrders";
import { countryLabelKey } from "../../data/countries";
import { formatMonthYear, formatPrice } from "../../lib/format";
import { pick } from "../../data/types";
import { PaymentStatusBadge } from "./StatusBadges";

/**
 * The cards of the order detail page.
 *
 * All four answer one question each and stop there. The temptation on a detail
 * page is to show everything the record holds; what an operator handling a
 * parcel actually needs is the address, the carrier, the amount and who to
 * call, which is why each card is short enough to read without scrolling it.
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
function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
        {label}
      </dt>
      <dd
        className={`m-0 text-[length:var(--text-body-sm)] text-[var(--text-primary)] ${mono ? "font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function CustomerCard({ order, onViewProfile }: { order: AdminOrder; onViewProfile: () => void }) {
  const { t } = useTranslation();
  const { customer } = order;
  const returning = customer.orderCount > 1;

  return (
    <Card
      title={t("admin.orders.customerTitle")}
      icon={UserRound}
      action={
        <Button size="sm" variant="ghost" iconRight={ArrowUpRight} onClick={onViewProfile}>
          {t("admin.orders.customerProfile")}
        </Button>
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
          {/* A first-time buyer and a fifteen-order studio are handled
              differently. The badge is the shortest way to say which one. */}
          <span className="flex items-center gap-1.5">
            <Badge tone={returning ? "brand" : "neutral"} size="sm">
              {returning ? t("admin.orders.customerReturning", { count: customer.orderCount }) : t("admin.orders.customerFirstOrder")}
            </Badge>
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
            <a
              href={`tel:${customer.phone.replace(/\s/g, "")}`}
              className="flex items-center gap-1.5 underline decoration-1 underline-offset-4 hover:text-[var(--accent-highlight-ink)]"
            >
              <Phone size={13} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
              {customer.phone}
            </a>
          }
        />
        <Field label={t("admin.orders.customerSince")} value={formatMonthYear(customer.since)} />
        <Field
          label={t("admin.orders.customerLifetime")}
          value={<span className="tabular-nums">{formatPrice(customer.lifetimeValue)}</span>}
        />
      </dl>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

export function ItemsCard({ order }: { order: AdminOrder }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const subtotal = orderSubtotal(order);
  const total = orderTotal(order);
  const tax = orderTax(order);

  return (
    <Card title={t("admin.orders.itemsTitle")} icon={Truck} className="lg:col-span-2">
      <ul className="m-0 grid list-none gap-0 p-0">
        {order.lines.map((line, index) => {
          const to = line.productId ? `/boutique/${line.productId}` : line.courseId ? `/academy/formation/${line.courseId}` : null;
          const name = pick(line.name, lang);
          return (
            <li
              key={`${line.productId ?? line.courseId}-${index}`}
              className="flex flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] py-3 first:pt-0 last:border-b-0 last:pb-0"
            >
              <span className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                {line.courseId ? (
                  <GraduationCap size={20} className="text-[var(--gt-blue-700)]" aria-hidden="true" />
                ) : (
                  <img src={line.image} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
              </span>

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
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {pick(line.variant, lang)}
                  </span>
                )}
                {line.courseId && (
                  <span className="text-[11px] text-[var(--text-subtle)]">{t("admin.orders.itemsDigital")}</span>
                )}
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
                <span className="tabular-nums text-[var(--text-body)]">{formatPrice(line.unitPrice)}</span>
              </span>

              <span className="grid w-[92px] flex-none text-right">
                <span className="text-[11px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
                  {t("admin.orders.itemsLineTotal")}
                </span>
                <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                  {formatPrice(line.unitPrice * line.qty)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* The financial summary. The total is the one figure on this page that
          gets a heavier weight and its own rule above it — it is what a dispute
          is about. */}
      <dl className="m-0 ml-auto grid w-full max-w-[320px] gap-2">
        <SummaryRow label={t("admin.orders.summarySubtotal", { count: orderItemCount(order) })} value={formatPrice(subtotal)} />
        {order.discount > 0 && (
          <SummaryRow
            label={order.discountCode ? t("admin.orders.summaryDiscountCode", { code: order.discountCode }) : t("admin.orders.summaryDiscount")}
            value={`− ${formatPrice(order.discount)}`}
            tone="good"
          />
        )}
        <SummaryRow
          label={t("admin.orders.summaryShipping")}
          value={order.shippingCost === 0 ? t("admin.orders.summaryShippingFree") : formatPrice(order.shippingCost)}
        />
        <SummaryRow
          label={t("admin.orders.summaryTax", { rate: Math.round(VAT_RATE * 100) })}
          value={formatPrice(tax)}
          muted
        />
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t-2 border-[var(--gt-ink-900)] pt-2.5">
          <dt className="text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)]">
            {t("admin.orders.summaryTotal")}
          </dt>
          <dd className="m-0 text-[length:var(--text-h3)] font-[var(--weight-black)] tabular-nums leading-none text-[var(--text-primary)]">
            {formatPrice(total)}
          </dd>
        </div>
        {order.payment.refunded != null && order.payment.refunded > 0 && (
          <SummaryRow label={t("admin.orders.summaryRefunded")} value={`− ${formatPrice(order.payment.refunded)}`} tone="bad" />
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
      <dd className={`m-0 text-[length:var(--text-body-sm)] tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function ShippingCard({ order, onTrack }: { order: AdminOrder; onTrack: () => void }) {
  const { t, i18n } = useTranslation();
  const { customer, shipment } = order;
  const locale = i18n.language.startsWith("en") ? "en-IE" : "fr-FR";
  const digital = order.shippingMethod === "digital";

  return (
    <Card
      title={t("admin.orders.shippingTitle")}
      icon={MapPin}
      action={
        shipment ? (
          <Button size="sm" variant="outline" iconLeft={Navigation} onClick={onTrack}>
            {t("admin.orders.trackShipment")}
          </Button>
        ) : undefined
      }
    >
      {digital ? (
        <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] p-3 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]">
          <GraduationCap size={15} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("admin.orders.shippingDigital")}
        </p>
      ) : (
        <>
          <dl className="m-0 grid gap-3">
            <Field label={t("admin.orders.shippingRecipient")} value={customerName(customer)} />
            <Field
              label={t("admin.orders.shippingAddress")}
              value={
                <address className="not-italic leading-[var(--leading-normal)]">
                  {customer.addressLine}
                  <br />
                  {customer.postalCode} {customer.city}
                  <br />
                  {t(countryLabelKey(customer.country))}
                </address>
              }
            />
            {/* The address flag belongs here, beside the address it is about —
                not only in the timeline where it would be a line of history. */}
            {order.attention === "addressIncomplete" && (
              <p className="m-0 flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-2.5 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
                <ShieldCheck size={13} aria-hidden="true" className="mt-0.5 flex-none" />
                {t("admin.orders.shippingAddressFlag")}
              </p>
            )}
          </dl>

          <dl className="m-0 grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
            <Field label={t("admin.orders.shippingMethodLabel")} value={t(`admin.orders.shippingMethod.${order.shippingMethod}`)} />
            {shipment ? (
              <>
                <Field label={t("admin.orders.shippingCarrier")} value={shipment.carrier} />
                <Field label={t("admin.orders.shippingTracking")} value={shipment.number} mono />
                <Field
                  label={t("admin.orders.shippingEta")}
                  value={
                    <span className="flex items-center gap-1.5">
                      <CalendarClock size={13} aria-hidden="true" className="text-[var(--text-muted)]" />
                      {new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
                        new Date(`${shipment.estimatedDelivery}T12:00:00`),
                      )}
                    </span>
                  }
                />
              </>
            ) : (
              <Field label={t("admin.orders.shippingTracking")} value={t("admin.orders.shippingNotShippedYet")} />
            )}
          </dl>
        </>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

export function PaymentCard({ order }: { order: AdminOrder }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en-IE" : "fr-FR";
  const { payment } = order;
  const card = payment.method === "visa" || payment.method === "mastercard";

  return (
    <Card title={t("admin.orders.paymentTitle")} icon={CreditCard}>
      <dl className="m-0 grid gap-3 sm:grid-cols-2">
        <Field
          label={t("admin.orders.paymentMethod")}
          value={
            <span className="flex items-center gap-2">
              {card ? <CreditCard size={14} aria-hidden="true" className="text-[var(--text-muted)]" /> : <Banknote size={14} aria-hidden="true" className="text-[var(--text-muted)]" />}
              {/* Masked, always. Four digits is all a back office ever needs to
                  match a payment to a statement, and all this prototype will
                  ever hold. */}
              {payment.last4
                ? `${t(`admin.orders.paymentMethods.${payment.method}`)} •••• ${payment.last4}`
                : t(`admin.orders.paymentMethods.${payment.method}`)}
            </span>
          }
        />
        <Field label={t("admin.orders.paymentStatusLabel")} value={<PaymentStatusBadge status={payment.status} size="sm" />} />
        <Field label={t("admin.orders.paymentReference")} value={payment.reference} mono />
        <Field
          label={t("admin.orders.paymentDate")}
          value={
            payment.capturedAt
              ? new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(`${payment.capturedAt}:00`))
              : t("admin.orders.paymentNotCaptured")
          }
        />
        <Field
          label={t("admin.orders.paymentAmount")}
          value={<span className="font-semibold tabular-nums">{formatPrice(payment.captured)}</span>}
        />
        {payment.refunded != null && payment.refunded > 0 && (
          <Field
            label={t("admin.orders.paymentRefunded")}
            value={
              <span className="font-semibold tabular-nums text-[var(--status-error-fg)]">
                {formatPrice(payment.refunded)}
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
