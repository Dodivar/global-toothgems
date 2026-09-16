import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Receipt, Truck } from "lucide-react";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import {
  isShipment,
  orderItemCount,
  orderTotal,
  shipmentStep,
  type Order,
  type OrderStatus,
} from "../../data/orders";
import { pick } from "../../data/types";
import { formatDate, formatDateShort, formatPrice } from "../../lib/format";

const statusTone: Record<OrderStatus, BadgeTone> = {
  processing: "warning",
  shipped: "brand",
  delivered: "success",
  accessGranted: "success",
  cancelled: "neutral",
};

/**
 * Delivery timeline for a physical order. The step comes from the order status,
 * so a status change moves the timeline and the two can never disagree. Course
 * orders and cancelled orders have nothing in transit and never render it.
 */
function ShipmentTracking({ order }: { order: Order }) {
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
        {order.tracking && (
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t(order.status === "delivered" ? "account.trackingDeliveredOn" : "account.trackingEta", {
              date: formatDateShort(order.tracking.estimatedDelivery),
            })}
          </span>
        )}
      </div>

      <ProgressBar variant="steps" tone="ink" steps={steps} current={shipmentStep(order)} />

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

export function OrderCard({ order, lang, onInvoice }: { order: Order; lang: string; onInvoice: () => void }) {
  const { t } = useTranslation();
  const total = orderTotal(order);
  const cancelled = order.status === "cancelled";

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
        <Badge tone={statusTone[order.status]} size="sm">
          {t(`account.orderStatus.${order.status}`)}
        </Badge>
      </div>

      <ul className="m-0 grid list-none gap-3 p-0">
        {order.lines.map((line, i) => {
          const name = pick(line.name, lang);
          const to = line.productId ? `/boutique/${line.productId}` : null;
          return (
            <li key={`${order.reference}-${i}`} className="flex items-center gap-3">
              <img
                src={line.image}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-12 w-12 flex-none rounded-[var(--radius-sm)] object-cover"
                style={{ opacity: cancelled ? 0.5 : 1 }}
              />
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
              </span>
              <span className="whitespace-nowrap text-[length:var(--text-body-sm)] tabular-nums text-[var(--text-body)]">
                {formatPrice(line.unitPrice * line.qty)}
              </span>
            </li>
          );
        })}
      </ul>

      {isShipment(order) && <ShipmentTracking order={order} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
        <Button variant="ghost" size="sm" iconLeft={Receipt} onClick={onInvoice}>
          {t("account.orderInvoice")}
        </Button>
        <span className="text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">
          {t("account.orderTotal")} {formatPrice(total)}
        </span>
      </div>
    </li>
  );
}
