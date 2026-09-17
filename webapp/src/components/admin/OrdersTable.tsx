import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import clsx from "clsx";
import type { AdminOrder } from "../../data/adminOrders";
import { orderTotal } from "../../data/adminOrders";
import { formatPrice } from "../../lib/format";
import type { SortKey } from "../../lib/adminOrderFilters";
import { AttentionBadge, FulfillmentBadge, OrderStatusBadge, PaymentStatusBadge } from "./StatusBadges";
import { CustomerCell, ItemsCell } from "./OrderCells";
import { RowActions } from "./RowActions";

/**
 * The orders table. The page's centre of gravity, so everything else was kept
 * short to give it room.
 *
 * Three decisions worth knowing about:
 *
 * - **A row is a link, and also clickable.** The reference is a real `<Link>`,
 *   which is what keyboard and assistive-technology users navigate and what
 *   makes an order openable in a new tab. The row's own `onClick` is a
 *   convenience for the mouse, and it ignores clicks that started on a control
 *   so the checkbox and the `…` menu still work.
 * - **Attention is a tint and a badge, never a red row.** Six flagged orders in
 *   a table of twenty-five should be findable at a glance without the page
 *   reading as an incident.
 * - **Below `xl` this component is not used at all.** The table becomes a list
 *   of cards (`OrderCardList`), because a nine-column table on a phone is either
 *   a horizontal scroll nobody discovers or a grid of unreadable fragments.
 *   The switch is at `xl`, not `lg`: the workspace rail costs 264px, so a
 *   1024px screen would leave the table about 730px and scrolling by 300 —
 *   cards are the better answer there. From 1280 the scroll is under 100px and
 *   it disappears entirely around 1400.
 */

export interface OrdersTableProps {
  orders: AdminOrder[];
  selected: Set<string>;
  onToggle: (reference: string) => void;
  onToggleAll: () => void;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  onAdvance: (order: AdminOrder) => void;
  onRefund: (order: AdminOrder) => void;
  onCancel: (order: AdminOrder) => void;
  onViewCustomer: (order: AdminOrder) => void;
  onInvoice: (order: AdminOrder, kind: "print" | "download") => void;
  /** Path of the detail page, including the current filters as a return target. */
  hrefFor: (order: AdminOrder) => string;
}

const headCell =
  "sticky top-0 z-10 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]";

function SortableHead({
  label,
  ascKey,
  descKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  ascKey: SortKey;
  descKey: SortKey;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  align?: "left" | "right";
}) {
  const { t } = useTranslation();
  const active = sort === ascKey || sort === descKey;
  const ascending = sort === ascKey;
  return (
    <th
      scope="col"
      className={clsx(headCell, align === "right" && "text-right")}
      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(ascending ? descKey : ascKey)}
        className={clsx(
          "inline-flex items-center gap-1 rounded-[var(--radius-xs)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          active && "text-[var(--text-primary)]",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        {active ? (
          ascending ? (
            <ArrowUp size={12} aria-hidden="true" />
          ) : (
            <ArrowDown size={12} aria-hidden="true" />
          )
        ) : (
          <ArrowDown size={12} aria-hidden="true" className="opacity-25" />
        )}
        <span className="sr-only">{t("admin.orders.sortHint")}</span>
      </button>
    </th>
  );
}

/** Time of day beside the date: two orders on the same day need separating. */
function placedCell(placedAt: string, locale: string): { day: string; time: string } {
  const date = new Date(`${placedAt}:00`);
  return {
    day: new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(date),
    time: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

export function OrdersTable(props: OrdersTableProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language.startsWith("en") ? "en-IE" : "fr-FR";
  const { orders, selected, onToggle, onToggleAll, sort, onSort, hrefFor } = props;

  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.reference));
  const someSelected = orders.some((o) => selected.has(o.reference));

  return (
    <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)] xl:block">
      {/* Both axes scroll inside the card. Nine columns need about 1024px of
          room; below that the choice is a crushed customer column or a
          horizontal scroll, and a name truncated to its avatar is worse than a
          scrollbar under a table that keeps its header pinned. */}
      <div className="max-h-[min(72vh,900px)] overflow-auto">
        <table className="w-full min-w-[1024px] table-fixed border-collapse text-[length:var(--text-body-sm)]">
          <caption className="sr-only">{t("admin.orders.tableCaption")}</caption>
          {/* Ratios, not pixels: under `table-fixed` a colgroup of fixed widths
              sets the table's width, so px values wider than the container
              would force a scrollbar even on a screen with room to spare. The
              `min-w` below is the real floor. */}
          <colgroup>
            <col style={{ width: "3.4%" }} />
            <col style={{ width: "16.6%" }} />
            <col style={{ width: "14.2%" }} />
            <col style={{ width: "6%" }} />
            <col style={{ width: "12.6%" }} />
            <col style={{ width: "7.7%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "11.3%" }} />
            <col style={{ width: "13.6%" }} />
            <col style={{ width: "3.6%" }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={clsx(headCell, "pl-4")}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(node) => {
                    // The tri-state box: "some of this page" is a real state and
                    // showing it as unchecked would make the bulk bar's count
                    // look wrong.
                    if (node) node.indeterminate = !allSelected && someSelected;
                  }}
                  onChange={onToggleAll}
                  aria-label={t("admin.orders.selectAllOnPage")}
                  className="h-4 w-4 accent-[var(--gt-ink-900)]"
                />
              </th>
              <th scope="col" className={headCell}>
                {t("admin.orders.colOrder")}
              </th>
              <th scope="col" className={headCell}>
                {t("admin.orders.colCustomer")}
              </th>
              <SortableHead
                label={t("admin.orders.colDate")}
                ascKey="dateAsc"
                descKey="dateDesc"
                sort={sort}
                onSort={onSort}
              />
              <th scope="col" className={headCell}>
                {t("admin.orders.colItems")}
              </th>
              <SortableHead
                label={t("admin.orders.colTotal")}
                ascKey="totalAsc"
                descKey="totalDesc"
                sort={sort}
                onSort={onSort}
                align="right"
              />
              <th scope="col" className={headCell}>
                {t("admin.orders.colPayment")}
              </th>
              <th scope="col" className={headCell}>
                {t("admin.orders.colFulfillment")}
              </th>
              <th scope="col" className={headCell}>
                {t("admin.orders.colStatus")}
              </th>
              <th scope="col" className={clsx(headCell, "pr-4 text-right")}>
                <span className="sr-only">{t("admin.orders.colActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isSelected = selected.has(order.reference);
              const flagged = Boolean(order.attention);
              const { day, time } = placedCell(order.placedAt, locale);
              return (
                <tr
                  key={order.reference}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a,button,input,label")) return;
                    navigate(hrefFor(order));
                  }}
                  className={clsx(
                    "group cursor-pointer border-b border-[var(--border-subtle)] transition-colors last:border-b-0",
                    isSelected ? "bg-[var(--surface-brand-wash)]" : "hover:bg-[var(--gt-ink-100)]/60",
                  )}
                  style={
                    flagged && !isSelected
                      ? { background: "linear-gradient(90deg, var(--gt-fuchsia-50) 0%, transparent 38%)" }
                      : undefined
                  }
                >
                  <td className="relative pl-4 align-middle">
                    {/* The flag's own marker: a hairline on the row's edge, the
                        quietest possible "look here" that survives a tint being
                        overridden by the selection colour. */}
                    {flagged && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent-highlight)]"
                      />
                    )}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(order.reference)}
                      aria-label={t("admin.orders.selectOrder", { reference: order.reference })}
                      className="h-4 w-4 accent-[var(--gt-ink-900)]"
                    />
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <span className="grid gap-1">
                      <Link
                        to={hrefFor(order)}
                        className="w-fit font-[var(--weight-bold)] tabular-nums text-[var(--text-primary)] transition-colors hover:text-[var(--accent-highlight-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        #{order.reference}
                      </Link>
                      {flagged && <AttentionBadge reason={order.attention!} size="sm" compact />}
                    </span>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <CustomerCell customer={order.customer} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    <span className="grid">
                      <span className="text-[var(--text-primary)]">{day}</span>
                      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">{time}</span>
                    </span>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <ItemsCell order={order} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-right align-middle font-[var(--weight-bold)] tabular-nums text-[var(--text-primary)]">
                    {formatPrice(orderTotal(order))}
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <PaymentStatusBadge status={order.payment.status} size="sm" compact />
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <FulfillmentBadge status={order.fulfillment} size="sm" compact />
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <OrderStatusBadge status={order.status} size="sm" compact />
                  </td>

                  <td className="pr-4 align-middle">
                    <span className="flex items-center justify-end">
                      <RowActions
                        order={order}
                        onView={() => navigate(hrefFor(order))}
                        onAdvance={() => props.onAdvance(order)}
                        onRefund={() => props.onRefund(order)}
                        onCancel={() => props.onCancel(order)}
                        onViewCustomer={() => props.onViewCustomer(order)}
                        onInvoice={(kind) => props.onInvoice(order, kind)}
                      />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * The same orders as cards, for tablet and phone.
 *
 * Not a shrunk table and not a horizontal scroller: the four facts that matter
 * on a phone — which order, who, how much, what state — are promoted to the top
 * of each card, and the rest stays one tap away on the detail page. The whole
 * card is the link, so the touch target is the card rather than a 16px
 * reference.
 */
export function OrderCardList(props: OrdersTableProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language.startsWith("en") ? "en-IE" : "fr-FR";
  const { orders, selected, onToggle, hrefFor } = props;

  return (
    <ul className="m-0 grid list-none gap-2.5 p-0 xl:hidden">
      {orders.map((order) => {
        const isSelected = selected.has(order.reference);
        const flagged = Boolean(order.attention);
        const { day, time } = placedCell(order.placedAt, locale);
        return (
          <li key={order.reference}>
            <article
              className={clsx(
                "relative overflow-hidden rounded-[var(--radius-card)] border bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)] transition-shadow",
                isSelected ? "border-[var(--gt-blue-400)]" : "border-[var(--border-subtle)]",
              )}
              style={
                flagged && !isSelected
                  ? { background: "linear-gradient(180deg, var(--gt-fuchsia-50) 0%, var(--surface-card) 46%)" }
                  : undefined
              }
            >
              {flagged && (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-[var(--accent-highlight)]" />
              )}

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(order.reference)}
                  aria-label={t("admin.orders.selectOrder", { reference: order.reference })}
                  className="mt-1 h-[18px] w-[18px] flex-none accent-[var(--gt-ink-900)]"
                />

                <div className="grid min-w-0 flex-1 gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid min-w-0 gap-0.5">
                      <Link
                        to={hrefFor(order)}
                        className="w-fit text-[length:var(--text-body-md)] font-[var(--weight-bold)] tabular-nums text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        #{order.reference}
                      </Link>
                      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                        {day} · {time}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-1">
                      <span className="text-[length:var(--text-body-md)] font-[var(--weight-bold)] tabular-nums text-[var(--text-primary)]">
                        {formatPrice(orderTotal(order))}
                      </span>
                      <RowActions
                        order={order}
                        onView={() => navigate(hrefFor(order))}
                        onAdvance={() => props.onAdvance(order)}
                        onRefund={() => props.onRefund(order)}
                        onCancel={() => props.onCancel(order)}
                        onViewCustomer={() => props.onViewCustomer(order)}
                        onInvoice={(kind) => props.onInvoice(order, kind)}
                      />
                    </span>
                  </div>

                  <CustomerCell customer={order.customer} />
                  <ItemsCell order={order} />

                  <div className="flex flex-wrap items-center gap-1.5">
                    <OrderStatusBadge status={order.status} size="sm" />
                    <PaymentStatusBadge status={order.payment.status} size="sm" />
                    <FulfillmentBadge status={order.fulfillment} size="sm" />
                    {flagged && <AttentionBadge reason={order.attention!} size="sm" />}
                  </div>

                  <Link
                    to={hrefFor(order)}
                    className="flex items-center justify-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] py-2 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {t("admin.orders.actionView")}
                    <ChevronRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
