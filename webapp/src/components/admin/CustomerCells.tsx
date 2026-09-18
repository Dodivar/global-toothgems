import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { avatarTint, customerInitials, customerName, type AdminCustomerRecord } from "../../data/adminCustomers";

/**
 * The repeated fragments of the customer table.
 *
 * They live here rather than inline in the table because the card list below
 * `xl` renders exactly the same fragments, and an avatar that drifts between
 * the two views is how a responsive table stops looking like one interface.
 */

/**
 * The avatar.
 *
 * Initials on a stable tint rather than a photograph: the shop has no customer
 * photographs, and a generic silhouette repeated twenty-two times down a column
 * is visual noise that carries no information. The tint is derived from the id,
 * so the same person is the same colour everywhere — which is what lets an
 * operator find the row they were just looking at.
 *
 * `aria-hidden`, always: the name is beside it in text, and an avatar announced
 * as "CV" before the name it belongs to is pure interference.
 */
export function Avatar({
  customer,
  size = 36,
}: {
  customer: AdminCustomerRecord;
  size?: number;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, background: avatarTint(customer.id), fontSize: Math.round(size * 0.36) }}
      className="grid flex-none place-items-center rounded-full font-[var(--weight-black)] uppercase tracking-[var(--tracking-tight)] text-[var(--gt-ink-900)]"
    >
      {customerInitials(customer)}
    </span>
  );
}

/** Avatar, name and customer id — the identity column. */
export function IdentityCell({
  customer,
  className,
}: {
  customer: AdminCustomerRecord;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={clsx("flex min-w-0 items-center gap-2.5", className)}>
      <Avatar customer={customer} />
      <span className="grid min-w-0">
        <span className="truncate font-semibold text-[var(--text-primary)]">{customerName(customer)}</span>
        <span className="truncate text-[11px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">
          {t("admin.customers.idPrefix")}
          {customer.id}
        </span>
      </span>
    </span>
  );
}

/**
 * Email over phone.
 *
 * Both are links rather than text. Copying an address out of a table cell is
 * the small friction that makes an operator keep a second tab of their mail
 * client open all day, and `mailto:`/`tel:` cost nothing to offer. The email is
 * allowed to break mid-word because studio addresses are long and truncating
 * one to an ellipsis hides the part that identifies it.
 */
export function ContactCell({ customer }: { customer: AdminCustomerRecord }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <a
        href={`mailto:${customer.email}`}
        onClick={(event) => event.stopPropagation()}
        className="truncate text-[var(--text-body)] underline decoration-1 underline-offset-2 transition-colors hover:text-[var(--accent-highlight-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {customer.email}
      </a>
      <a
        href={`tel:${customer.phone.replace(/\s/g, "")}`}
        onClick={(event) => event.stopPropagation()}
        className="w-fit whitespace-nowrap text-[11px] tabular-nums text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        {customer.phone}
      </a>
    </span>
  );
}

/**
 * Order count over the date of the last order in the book.
 *
 * The count is the lifetime figure and the date comes from the current book, so
 * they are never presented as the same fact: "6 orders" sits above "last 14
 * Sep", and a customer whose recent orders are all outside the eleven-day
 * window shows the count with a dash under it rather than a date that would
 * imply they had stopped buying.
 */
export function OrdersCell({
  customer,
  lastOrder,
  locale,
}: {
  customer: AdminCustomerRecord;
  lastOrder?: string;
  locale: string;
}) {
  const { t } = useTranslation();
  return (
    <span className="grid gap-0.5">
      <span className="font-semibold tabular-nums text-[var(--text-primary)]">
        {customer.orderCount === 0 ? (
          <span className="font-normal text-[var(--text-subtle)]">{t("admin.customers.noOrders")}</span>
        ) : (
          t("admin.customers.orderCount", { count: customer.orderCount })
        )}
      </span>
      <span className="whitespace-nowrap text-[11px] text-[var(--text-muted)]">
        {lastOrder
          ? t("admin.customers.lastOrderShort", {
              date: new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(
                new Date(`${lastOrder}:00`),
              ),
            })
          : "—"}
      </span>
    </span>
  );
}
