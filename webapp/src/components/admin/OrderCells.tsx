import { useTranslation } from "react-i18next";
import { GraduationCap } from "lucide-react";
import type { AdminCustomer, AdminOrder } from "../../data/adminOrders";
import { customerInitials, customerName, orderItemCount } from "../../data/adminOrders";
import { pick } from "../../data/types";

/**
 * The two cells the table and the mobile cards render identically — the
 * customer and the basket. They live here so the phone layout cannot drift from
 * the desktop one as either changes.
 */

/** Stable pastel per customer, so the same person keeps the same avatar. */
const AVATAR_TINTS = [
  "var(--gt-blue-200)",
  "var(--gt-blue-100)",
  "var(--gt-emerald-50)",
  "var(--gt-fuchsia-50)",
  "var(--gt-sand)",
];

function tint(customer: AdminCustomer): string {
  const seed = customer.id.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return AVATAR_TINTS[seed % AVATAR_TINTS.length];
}

export function CustomerCell({ customer, compact = false }: { customer: AdminCustomer; compact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid h-8 w-8 flex-none place-items-center rounded-full text-[11px] font-[var(--weight-bold)] text-[var(--gt-ink-800)]"
        style={{ background: tint(customer) }}
      >
        {customerInitials(customer)}
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {customerName(customer)}
        </span>
        {!compact && (
          <span className="truncate text-[11px] text-[var(--text-muted)]">{customer.email}</span>
        )}
      </span>
    </span>
  );
}

/**
 * The basket, as overlapping thumbnails plus the first line's name.
 *
 * A course has no packshot worth showing at 28px, so it gets the Academy glyph
 * instead of a cropped photo of a classroom — the distinction between a parcel
 * and a seat matters to whoever is picking orders.
 */
export function ItemsCell({ order, className }: { order: AdminOrder; className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const shown = order.lines.slice(0, 3);
  const extra = order.lines.length - shown.length;
  const units = orderItemCount(order);

  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${className ?? ""}`}>
      <span aria-hidden="true" className="flex flex-none items-center">
        {shown.map((line, index) => (
          <span
            key={`${line.productId ?? line.courseId}-${index}`}
            className="grid h-8 w-8 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]"
            style={{ marginLeft: index === 0 ? 0 : -10, zIndex: shown.length - index }}
          >
            {line.courseId ? (
              <GraduationCap size={14} className="text-[var(--gt-blue-700)]" />
            ) : (
              <img src={line.image} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
          </span>
        ))}
        {extra > 0 && (
          <span
            className="ml-[-10px] grid h-8 min-w-8 place-items-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-1 text-[10px] font-semibold text-[var(--text-muted)]"
            style={{ zIndex: 0 }}
          >
            +{extra}
          </span>
        )}
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
          {pick(order.lines[0].name, lang)}
        </span>
        <span className="text-[11px] text-[var(--text-muted)]">
          {extra > 0
            ? t("admin.orders.itemsMore", { count: extra, units })
            : t("admin.orders.itemsUnits", { count: units })}
        </span>
      </span>
    </span>
  );
}
