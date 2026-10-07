import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "../../lib/navigation";
import { ArrowRight, Truck } from "lucide-react";
import { Badge, type BadgeTone } from "../ui/Badge";
import { OrderLineThumb } from "./OrderLineThumb";
import { ProgressBar } from "../ui/ProgressBar";
import {
  isActiveOrder,
  isShipment,
  orderItemCount,
  shipmentStep,
  type Order,
  type OrderPaymentState,
  type OrderStatus,
  type PurchasedItem,
} from "../../data/orders";
import { pick } from "../../data/types";
import { useFormat } from "../../lib/format";
import { orderHref } from "../../lib/memberSpace";
import { courseHref } from "../../lib/academyUrl";

const statusTone: Record<OrderStatus, BadgeTone> = {
  processing: "warning",
  confirmed: "success",
  shipped: "brand",
  delivered: "success",
  accessGranted: "success",
  cancelled: "neutral",
  refunded: "neutral",
};

/**
 * The order's state as text: its commercial status and, when money went
 * back, the payment state — two independent axes, both worded (never colour
 * alone).
 */
export function OrderStatusBadges({ order }: { order: Order }) {
  const { t } = useTranslation();
  const showPayment: OrderPaymentState | null =
    order.payment === "partiallyRefunded" || (order.payment === "refunded" && order.status !== "refunded")
      ? order.payment
      : null;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Badge tone={statusTone[order.status]} size="sm">
        {t(`account.orderStatus.${order.status}`)}
      </Badge>
      {showPayment && (
        <Badge tone="highlight" size="sm">
          {t(`account.orderPayment.${showPayment}`)}
        </Badge>
      )}
    </span>
  );
}

/**
 * Delivery timeline for a physical order. The step comes from the recorded
 * statuses, so the timeline and the badge never disagree. Digital orders and
 * orders that no longer stand have nothing in transit and never render it.
 */
export function ShipmentTracking({ order }: { order: Order }) {
  const { formatDateShort } = useFormat();
  const { t } = useTranslation();
  const steps = [
    t("account.trackingStep.confirmed"),
    t("account.trackingStep.shipped"),
    t("account.trackingStep.delivered"),
  ];

  return (
    <div className="grid gap-4 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
          <Truck size={15} aria-hidden="true" />
          {t("account.trackingTitle")}
        </strong>
        {order.tracking?.estimatedDelivery && (
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t(order.status === "delivered" ? "account.trackingDeliveredOn" : "account.trackingEta", {
              date: formatDateShort(order.tracking.estimatedDelivery),
            })}
          </span>
        )}
      </div>

      <ProgressBar variant="steps" tone="ink" steps={steps} current={shipmentStep(order)} />

      {order.fulfilment === "partiallyShipped" && order.status !== "delivered" && (
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">{t("account.trackingPartial")}</p>
      )}

      {order.tracking ? (
        <dl className="m-0 flex flex-wrap gap-x-8 gap-y-1 text-[length:var(--text-caption)]">
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)]">{t("account.trackingCarrier")}</dt>
            <dd className="m-0 font-semibold text-[var(--text-primary)]">{order.tracking.carrier}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)]">{t("account.trackingNumber")}</dt>
            <dd className="m-0 font-semibold text-[var(--text-primary)]" style={{ fontFamily: "var(--gt-font-mono)" }}>
              {order.tracking.number}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("account.trackingPending")}</p>
      )}
    </div>
  );
}

export function OrderCard({
  order,
  lang,
  lineAction,
}: {
  order: Order;
  lang: string;
  /** Extra control under a line's details — the order history uses it for "Write a review". */
  lineAction?: (line: PurchasedItem) => ReactNode;
}) {
  const { formatDate, formatMoney } = useFormat();
  const { t } = useTranslation();
  const active = isActiveOrder(order);

  return (
    <li className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
            {t("account.orderReference", { reference: order.reference })}
          </strong>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("account.orderPlacedOn", { date: formatDate(order.placedOn) })} ·{" "}
            {t("account.orderItems", { count: orderItemCount(order) })}
          </span>
        </div>
        <OrderStatusBadges order={order} />
      </div>

      <ul className="m-0 grid list-none gap-3 p-0">
        {order.lines.map((line) => {
          const name = pick(line.name, lang);
          const to = line.productId ? `/boutique/${line.productId}` : line.courseId ? courseHref(line.courseId) : null;
          return (
            <li key={line.id} className="flex items-center gap-3">
              <OrderLineThumb line={line} size={48} dimmed={!active} />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                  {to ? (
                    <Link to={to} className="underline decoration-1 underline-offset-4 hover:text-[var(--text-link-hover)]">
                      {name}
                    </Link>
                  ) : (
                    name
                  )}
                </span>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {line.variant ? `${pick(line.variant, lang)} · ` : ""}
                  {t("account.orderQty", { qty: line.qty })}
                </span>
                {lineAction && active && lineAction(line)}
              </span>
              <span className="whitespace-nowrap text-[length:var(--text-body-sm)] tabular-nums text-[var(--text-body)]">
                {formatMoney(line.totalAmount, order.currency)}
              </span>
            </li>
          );
        })}
      </ul>

      {isShipment(order) && <ShipmentTracking order={order} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
        <Link
          to={orderHref(order.reference)}
          aria-label={t("account.orderViewLabel", { reference: order.reference })}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-control)] px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {t("account.orderView")}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
        <span className="grid justify-items-end gap-0.5">
          <span className="text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">
            {t("account.orderTotal")} {formatMoney(order.amounts.total, order.currency)}
          </span>
          {order.amounts.refunded > 0 && (
            <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
              {t("account.orderRefundedAmount", { amount: formatMoney(order.amounts.refunded, order.currency) })}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}
