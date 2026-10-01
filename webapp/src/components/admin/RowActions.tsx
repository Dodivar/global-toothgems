import { useTranslation } from "react-i18next";
import {
  Ban,
  Download,
  Eye,
  MoreHorizontal,
  Printer,
  Truck,
  UserRound,
} from "lucide-react";
import { Menu, type MenuItem } from "../ui/Menu";
import { holdsMoney, type AdminOrder } from "../../data/adminOrders";

/**
 * Secondary actions for one order.
 *
 * "View order" is not in here — it is the row itself, and duplicating the
 * primary action inside a menu is how an interface teaches people that the
 * obvious click is not the real one. What is in here is everything that
 * *changes* something, which is also why the two destructive entries sit below
 * a rule, in the error tone, at the end: an operator reaching for "print
 * invoice" should never land on "cancel order".
 *
 * Which entries appear depends on the order. A delivered order, or one whose
 * money is held, cannot be cancelled here (its refund goes through Stripe) —
 * offering an action that will be refused is worse than not offering it.
 * Refunds are not offered: they are Stripe calls confirmed by its webhook.
 */
export function RowActions({
  order,
  onView,
  onAdvance,
  onCancel,
  onViewCustomer,
  onInvoice,
}: {
  order: AdminOrder;
  onView: () => void;
  /** Move the order one step along its track. Absent for closed orders. */
  onAdvance?: (label: string) => void;
  onCancel: () => void;
  onViewCustomer: () => void;
  onInvoice: (kind: "print" | "download") => void;
}) {
  const { t } = useTranslation();

  const closed = order.status === "cancelled" || order.status === "refunded";

  const items: MenuItem[] = [
    { id: "view", label: t("admin.orders.actionView"), icon: Eye, onSelect: onView },
  ];

  if (onAdvance && !closed) {
    items.push({ id: "advance", label: t("admin.orders.actionAdvance"), icon: Truck, onSelect: () => onAdvance(t("admin.orders.actionAdvance")) });
  }

  items.push(
    { id: "customer", label: t("admin.orders.actionViewCustomer"), icon: UserRound, onSelect: onViewCustomer },
    { id: "print", label: t("admin.orders.actionPrintInvoice"), icon: Printer, onSelect: () => onInvoice("print") },
    { id: "download", label: t("admin.orders.actionDownloadInvoice"), icon: Download, onSelect: () => onInvoice("download") },
  );

  if (!closed && order.status !== "delivered" && !holdsMoney(order)) {
    items.push({ id: "cancel", label: t("admin.orders.actionCancel"), icon: Ban, destructive: true, onSelect: onCancel });
  }

  return (
    <Menu
      label={t("admin.orders.rowActionsLabel", { reference: order.reference })}
      items={items}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="grid h-8 w-8 place-items-center rounded-[var(--radius-pill)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <MoreHorizontal size={17} aria-hidden="true" />
        </button>
      )}
    />
  );
}
