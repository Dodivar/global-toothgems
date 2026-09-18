import { useTranslation } from "react-i18next";
import { Ban, CircleCheck, GraduationCap, Mail, MoreHorizontal, Pencil, ShoppingBag } from "lucide-react";
import { Menu, type MenuItem } from "../ui/Menu";
import { customerName, type AdminCustomerRecord } from "../../data/adminCustomers";

/**
 * Secondary actions for one customer.
 *
 * "View customer" is not in here — it is the row itself, and duplicating the
 * primary action inside a menu is how an interface teaches people that the
 * obvious click is not the real one. What is in here is everything that *goes
 * somewhere else* or *changes something*, with the account action last, below a
 * rule, in the error tone.
 *
 * Which entries appear depends on the account. An account with no orders offers
 * no "view orders", one with no training offers no "training activity", and a
 * suspended account offers "reactivate" rather than "disable" — an action that
 * will be refused, or that does nothing, is worse than no action.
 */
export function CustomerRowActions({
  customer,
  onEdit,
  onViewOrders,
  onViewTraining,
  onEmail,
  onToggleAccount,
}: {
  customer: AdminCustomerRecord;
  onEdit: () => void;
  onViewOrders: () => void;
  onViewTraining: () => void;
  onEmail: () => void;
  onToggleAccount: () => void;
}) {
  const { t } = useTranslation();
  const suspended = customer.status === "suspended";

  const items: MenuItem[] = [
    { id: "edit", label: t("admin.customers.actionEdit"), icon: Pencil, onSelect: onEdit },
  ];

  if (customer.orderCount > 0) {
    items.push({
      id: "orders",
      label: t("admin.customers.actionViewOrders"),
      icon: ShoppingBag,
      onSelect: onViewOrders,
    });
  }
  if (customer.enrollments.length > 0) {
    items.push({
      id: "training",
      label: t("admin.customers.actionViewTraining"),
      icon: GraduationCap,
      onSelect: onViewTraining,
    });
  }

  items.push({ id: "email", label: t("admin.customers.actionEmail"), icon: Mail, onSelect: onEmail });

  // Reactivating is not destructive, but it shares the slot with the action it
  // replaces so the menu's last entry is always "the one that changes access".
  items.push(
    suspended
      ? {
          id: "reactivate",
          label: t("admin.customers.actionReactivate"),
          icon: CircleCheck,
          onSelect: onToggleAccount,
        }
      : {
          id: "disable",
          label: t("admin.customers.actionDisable"),
          icon: Ban,
          destructive: true,
          onSelect: onToggleAccount,
        },
  );

  return (
    <Menu
      label={t("admin.customers.rowActionsLabel", { name: customerName(customer) })}
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
