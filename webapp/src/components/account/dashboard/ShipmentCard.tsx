import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, ArrowUpRight, Package } from "lucide-react";
import { Link } from "../../../lib/navigation";
import { OrderLineThumb } from "../OrderLineThumb";
import { ShipmentTracking } from "../OrderCard";
import { orderItemCount, type Order } from "../../../data/orders";
import { useFormat } from "../../../lib/format";
import { orderHref } from "../../../lib/memberSpace";

/**
 * The parcel to come: the newest order still on its way (`ordersOnTheirWay`),
 * what it holds, where it is on the confirmed → shipped → delivered line, and
 * the carrier's page once there is one. The other orders on their way are
 * counted with a link to the history. Leaves the dashboard once delivered —
 * the review request takes over from there.
 */
export function ShipmentCard({ orders }: { orders: Order[] }) {
  const { t } = useTranslation();
  const { formatDate } = useFormat();
  const titleId = useId();
  const [order] = orders;
  if (!order) return null;
  const others = orders.length - 1;
  const lines = order.lines.slice(0, 4);

  return (
    <section
      aria-labelledby={titleId}
      className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]"
    >
      <div className="grid gap-1">
        <span className="gt-eyebrow flex items-center gap-2">
          <Package size={13} aria-hidden="true" />
          {t("account.dashboard.shipmentEyebrow")}
        </span>
        <h2 id={titleId} className="m-0 text-[length:var(--text-h4)] text-[var(--text-primary)]">
          {t(order.status === "shipped" ? "account.dashboard.shipmentShipped" : "account.dashboard.shipmentPreparing")}
        </h2>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("account.orderReference", { reference: order.reference })} · {t("account.orderPlacedOn", { date: formatDate(order.placedOn) })} ·{" "}
          {t("account.orderItems", { count: orderItemCount(order) })}
        </p>
      </div>

      {lines.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {lines.map((line) => (
            <li key={line.id}>
              <OrderLineThumb line={line} size={48} />
            </li>
          ))}
        </ul>
      )}

      <ShipmentTracking order={order} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {order.tracking?.url && (
          <a
            href={order.tracking.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-inverse)] px-5 text-[length:var(--text-body-sm)] font-bold text-[var(--text-inverse)] no-underline transition-colors hover:bg-[var(--gt-ink-700)]"
          >
            {t("account.dashboard.shipmentTrack")}
            <ArrowUpRight size={16} aria-hidden="true" />
            <span className="sr-only">{t("account.dashboard.newTab")}</span>
          </a>
        )}
        <Link
          to={orderHref(order.reference)}
          className="inline-flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]"
        >
          {t("account.orderView")}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
        {others > 0 && (
          <Link
            to="/compte/commandes"
            className="text-[length:var(--text-caption)] text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
          >
            {t("account.dashboard.shipmentOthers", { count: others })}
          </Link>
        )}
      </div>
    </section>
  );
}
