import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { formatPrice } from "../../lib/format";
import type { CustomerSortKey } from "../../lib/adminCustomerFilters";
import {
  customerName,
  trainingState,
  type AdminCustomerRecord,
} from "../../data/adminCustomers";
import { CustomerStatusBadge, TagBadge, TrainingBadge } from "./CustomerBadges";
import { Avatar, ContactCell, IdentityCell, OrdersCell } from "./CustomerCells";
import { CustomerRowActions } from "./CustomerRowActions";

/**
 * The customers table. The page's centre of gravity, so everything above it was
 * kept short to give it room.
 *
 * Three decisions worth knowing about, and they are the orders table's, because
 * an administrator who has learned one of these tables should not have to learn
 * the other:
 *
 * - **A row is a link, and also clickable.** The name is a real `<Link>`, which
 *   is what keyboard and assistive-technology users navigate and what makes a
 *   customer openable in a new tab. The row's own `onClick` is a convenience
 *   for the mouse, and it ignores clicks that started on a control so the
 *   checkbox, the mail link and the `…` menu still work.
 * - **A suspended account is a hairline and a badge, never a red row.** The
 *   list has to stay readable when three accounts are suspended; a table of red
 *   bands reads as an incident rather than as a base with three problems in it.
 * - **Below `xl` this component is not used at all.** The table becomes a list
 *   of cards (`CustomerCardList`). The switch is at `xl` rather than `lg` for
 *   the reason `OrdersTable` documents: the workspace rail costs 264px, so a
 *   1024px screen leaves the table about 730px and would scroll it by 300.
 */

export interface CustomersTableProps {
  customers: AdminCustomerRecord[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  sort: CustomerSortKey;
  onSort: (sort: CustomerSortKey) => void;
  onEdit: (customer: AdminCustomerRecord) => void;
  onViewOrders: (customer: AdminCustomerRecord) => void;
  onViewTraining: (customer: AdminCustomerRecord) => void;
  onEmail: (customer: AdminCustomerRecord) => void;
  onToggleAccount: (customer: AdminCustomerRecord) => void;
  /** Last order in the current book, keyed by customer id. */
  lastOrders: Map<string, string>;
  /** Path of the detail page, including the current filters as a return target. */
  hrefFor: (customer: AdminCustomerRecord) => string;
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
  ascKey: CustomerSortKey;
  descKey: CustomerSortKey;
  sort: CustomerSortKey;
  onSort: (sort: CustomerSortKey) => void;
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
        <span className="sr-only">{t("admin.customers.sortHint")}</span>
      </button>
    </th>
  );
}

export function CustomersTable(props: CustomersTableProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language.startsWith("en") ? "en-IE" : "fr-FR";
  const { customers, selected, onToggle, onToggleAll, sort, onSort, lastOrders, hrefFor } = props;

  const allSelected = customers.length > 0 && customers.every((c) => selected.has(c.id));
  const someSelected = customers.some((c) => selected.has(c.id));

  return (
    <div className="hidden overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)] xl:block">
      {/* Both axes scroll inside the card, with the header pinned: the column
          meanings have to survive scrolling a base of two hundred. */}
      <div className="gt-admin-scroll max-h-[min(72vh,900px)] overflow-auto">
        <table className="w-full min-w-[1080px] table-fixed border-collapse text-[length:var(--text-body-sm)]">
          <caption className="sr-only">{t("admin.customers.tableCaption")}</caption>
          {/* Ratios, not pixels: under `table-fixed` a colgroup of fixed widths
              sets the table's width, so px values wider than the container
              would force a scrollbar even on a screen with room to spare. The
              `min-w` above is the real floor. */}
          <colgroup>
            <col style={{ width: "3.4%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "19%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "9.5%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "10.5%" }} />
            <col style={{ width: "12%" }} />
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
                  aria-label={t("admin.customers.selectAllOnPage")}
                  className="h-4 w-4 accent-[var(--gt-ink-900)]"
                />
              </th>
              <SortableHead
                label={t("admin.customers.colCustomer")}
                ascKey="nameAsc"
                descKey="nameDesc"
                sort={sort}
                onSort={onSort}
              />
              <th scope="col" className={headCell}>
                {t("admin.customers.colContact")}
              </th>
              <SortableHead
                label={t("admin.customers.colOrders")}
                ascKey="ordersAsc"
                descKey="ordersDesc"
                sort={sort}
                onSort={onSort}
              />
              <SortableHead
                label={t("admin.customers.colSpent")}
                ascKey="spentAsc"
                descKey="spentDesc"
                sort={sort}
                onSort={onSort}
                align="right"
              />
              <th scope="col" className={headCell}>
                {t("admin.customers.colTraining")}
              </th>
              <th scope="col" className={headCell}>
                {t("admin.customers.colStatus")}
              </th>
              <SortableHead
                label={t("admin.customers.colJoined")}
                ascKey="recentAsc"
                descKey="recentDesc"
                sort={sort}
                onSort={onSort}
              />
              <th scope="col" className={clsx(headCell, "pr-4 text-right")}>
                <span className="sr-only">{t("admin.customers.colActions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const isSelected = selected.has(customer.id);
              const suspended = customer.status === "suspended";
              return (
                <tr
                  key={customer.id}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a,button,input,label")) return;
                    navigate(hrefFor(customer));
                  }}
                  className={clsx(
                    "group cursor-pointer border-b border-[var(--border-subtle)] transition-colors last:border-b-0",
                    isSelected ? "bg-[var(--surface-brand-wash)]" : "hover:bg-[var(--gt-ink-100)]/60",
                  )}
                  style={
                    suspended && !isSelected
                      ? { background: "linear-gradient(90deg, var(--gt-red-50) 0%, transparent 34%)" }
                      : undefined
                  }
                >
                  <td className="relative pl-4 align-middle">
                    {/* The suspension's own marker: a hairline on the row's
                        edge, the quietest possible "look here" that survives
                        the tint being overridden by the selection colour. */}
                    {suspended && (
                      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-[var(--gt-red-500)]" />
                    )}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(customer.id)}
                      aria-label={t("admin.customers.selectCustomer", { name: customerName(customer) })}
                      className="h-4 w-4 accent-[var(--gt-ink-900)]"
                    />
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <Link
                      to={hrefFor(customer)}
                      className="block rounded-[var(--radius-xs)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      <IdentityCell customer={customer} />
                    </Link>
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <ContactCell customer={customer} />
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <OrdersCell customer={customer} lastOrder={lastOrders.get(customer.id)} locale={locale} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-right align-middle font-[var(--weight-bold)] tabular-nums text-[var(--text-primary)]">
                    {customer.lifetimeValue === 0 ? (
                      <span className="font-normal text-[var(--text-subtle)]">—</span>
                    ) : (
                      formatPrice(customer.lifetimeValue)
                    )}
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <TrainingBadge state={trainingState(customer)} size="sm" />
                  </td>

                  <td className="px-3 py-3 align-middle">
                    <CustomerStatusBadge status={customer.status} size="sm" />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 align-middle text-[var(--text-body)]">
                    {new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(
                      new Date(`${customer.since}T12:00:00`),
                    )}
                  </td>

                  <td className="pr-4 align-middle">
                    <span className="flex items-center justify-end">
                      <CustomerRowActions
                        customer={customer}
                        onEdit={() => props.onEdit(customer)}
                        onViewOrders={() => props.onViewOrders(customer)}
                        onViewTraining={() => props.onViewTraining(customer)}
                        onEmail={() => props.onEmail(customer)}
                        onToggleAccount={() => props.onToggleAccount(customer)}
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
 * The same customers as cards, for tablet and phone.
 *
 * Not a shrunk table and not a horizontal scroller. The information
 * architecture is re-cut for the screen: who they are and what state the
 * account is in go to the top, the two figures an operator actually compares
 * — orders and lifetime spend — become a two-column strip, and the contact
 * details stay as tappable links because a phone is the device where calling
 * the customer is one tap rather than a copy-paste.
 *
 * The whole card ends in a full-width link, so the touch target is a bar rather
 * than a 14px name.
 */
export function CustomerCardList(props: CustomersTableProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en-IE" : "fr-FR";
  const { customers, selected, onToggle, lastOrders, hrefFor } = props;

  return (
    <ul className="m-0 grid list-none gap-2.5 p-0 xl:hidden">
      {customers.map((customer) => {
        const isSelected = selected.has(customer.id);
        const suspended = customer.status === "suspended";
        const lastOrder = lastOrders.get(customer.id);
        return (
          <li key={customer.id}>
            <article
              className={clsx(
                "relative overflow-hidden rounded-[var(--radius-card)] border bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)]",
                isSelected ? "border-[var(--gt-blue-400)]" : "border-[var(--border-subtle)]",
              )}
              style={
                suspended && !isSelected
                  ? { background: "linear-gradient(180deg, var(--gt-red-50) 0%, var(--surface-card) 44%)" }
                  : undefined
              }
            >
              {suspended && (
                <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-[var(--gt-red-500)]" />
              )}

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggle(customer.id)}
                  aria-label={t("admin.customers.selectCustomer", { name: customerName(customer) })}
                  className="mt-1.5 h-[18px] w-[18px] flex-none accent-[var(--gt-ink-900)]"
                />

                <div className="grid min-w-0 flex-1 gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar customer={customer} size={40} />
                      <span className="grid min-w-0">
                        <Link
                          to={hrefFor(customer)}
                          className="w-fit truncate text-[length:var(--text-body-md)] font-[var(--weight-bold)] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                        >
                          {customerName(customer)}
                        </Link>
                        <span className="truncate text-[11px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
                          {t("admin.customers.idPrefix")}
                          {customer.id}
                        </span>
                      </span>
                    </span>
                    <CustomerRowActions
                      customer={customer}
                      onEdit={() => props.onEdit(customer)}
                      onViewOrders={() => props.onViewOrders(customer)}
                      onViewTraining={() => props.onViewTraining(customer)}
                      onEmail={() => props.onEmail(customer)}
                      onToggleAccount={() => props.onToggleAccount(customer)}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <CustomerStatusBadge status={customer.status} size="sm" />
                    <TrainingBadge state={trainingState(customer)} size="sm" />
                    {customer.tags.slice(0, 2).map((tag) => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                  </div>

                  {/* The two figures side by side: on a phone this is the
                      comparison the operator is making, and stacking them as
                      two more label/value rows buries it. */}
                  <dl className="m-0 grid grid-cols-2 gap-2 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3">
                    <div className="grid gap-0.5">
                      <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                        {t("admin.customers.colOrders")}
                      </dt>
                      <dd className="m-0 text-[length:var(--text-body-sm)] font-[var(--weight-bold)] tabular-nums text-[var(--text-primary)]">
                        {customer.orderCount}
                        {lastOrder && (
                          <span className="ml-1.5 text-[11px] font-normal text-[var(--text-muted)]">
                            {t("admin.customers.lastOrderShort", {
                              date: new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(
                                new Date(`${lastOrder}:00`),
                              ),
                            })}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="grid gap-0.5">
                      <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                        {t("admin.customers.colSpent")}
                      </dt>
                      <dd className="m-0 text-[length:var(--text-body-sm)] font-[var(--weight-bold)] tabular-nums text-[var(--text-primary)]">
                        {customer.lifetimeValue === 0 ? "—" : formatPrice(customer.lifetimeValue)}
                      </dd>
                    </div>
                  </dl>

                  <ContactCell customer={customer} />

                  <Link
                    to={hrefFor(customer)}
                    className="flex items-center justify-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] py-2.5 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {t("admin.customers.actionView")}
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
