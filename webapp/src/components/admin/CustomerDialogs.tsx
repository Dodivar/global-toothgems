import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, ShieldAlert, UserPlus } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { CustomerStatusBadge } from "./CustomerBadges";
import { Avatar } from "./CustomerCells";
import {
  STAFF_SETTABLE_STATUSES,
  customerName,
  type AdminCustomerRecord,
  type StaffSettableStatus,
} from "../../data/adminCustomers";

/**
 * The confirmations of the customer workspace.
 *
 * Both exist because the action behind them is consequential. They share
 * `ui/Dialog`, which owns the focus trap, the Escape handling and the focus
 * return.
 *
 * The rule they all follow: **say what will happen to whom, in the plural the
 * operator is actually in.** "Suspend customer?" over a selection of twelve is
 * how an afternoon disappears, so every one of these counts its targets and
 * names them when there are few enough to name.
 */

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Changing one account's status.
 *
 * The statuses staff may set are radio buttons with their consequences spelled
 * out underneath, not a select: what a suspension does is exactly what an
 * operator needs explained at the moment of choosing. A closed (deactivated)
 * account is shown as its current state but is never offered.
 *
 * Confirming is disabled until the choice differs from the current status —
 * a dialog that lets you "confirm" a change to the state you are already in
 * writes an audit entry saying something happened when nothing did.
 */
export function StatusDialog({
  customer,
  busy = false,
  onClose,
  onConfirm,
}: {
  customer: AdminCustomerRecord | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (status: StaffSettableStatus) => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<StaffSettableStatus>("active");

  // Reopening on a different customer must not inherit the last one's choice.
  useEffect(() => {
    if (customer) setChoice(customer.status === "suspended" ? "suspended" : "active");
  }, [customer]);

  if (!customer) return null;
  const danger = choice === "suspended";

  return (
    <Dialog
      open
      onClose={onClose}
      tone={danger ? "danger" : "neutral"}
      icon={danger ? <ShieldAlert size={18} /> : <CustomerStatusBadgeIcon status={choice} />}
      title={t("admin.customers.statusDialogTitle", { name: customerName(customer) })}
      description={t("admin.customers.statusDialogBody")}
      closeLabel={t("common.close")}
      footer={
        <>
          <span className="flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("admin.customers.statusDialogCurrent")}
            <CustomerStatusBadge status={customer.status} size="sm" />
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant={danger ? "dark" : "primary"}
              disabled={choice === customer.status || busy}
              loading={busy}
              onClick={() => onConfirm(choice)}
            >
              {t("admin.customers.statusDialogConfirm")}
            </Button>
          </span>
        </>
      }
    >
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="sr-only">{t("admin.customers.statusDialogLegend")}</legend>
        {STAFF_SETTABLE_STATUSES.map((status) => (
          <label
            key={status}
            className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3 transition-colors ${
              choice === status
                ? "border-[var(--gt-ink-900)] bg-[var(--surface-sunken)]"
                : "border-[var(--border-subtle)] hover:bg-[var(--gt-ink-100)]"
            }`}
          >
            <input
              type="radio"
              name="gt-customer-status"
              value={status}
              checked={choice === status}
              onChange={() => setChoice(status)}
              className="mt-0.5 h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
            />
            <span className="grid gap-1">
              <span className="flex items-center gap-2">
                <CustomerStatusBadge status={status} size="sm" />
              </span>
              <span className="text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
                {t(`admin.customers.statusConsequence.${status}`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}

/** The dialog header's icon, matching whichever status is currently chosen. */
function CustomerStatusBadgeIcon({ status }: { status: StaffSettableStatus }) {
  return status === "suspended" ? <Ban size={18} /> : <UserPlus size={18} />;
}

/* -------------------------------------------------------------------------- */
/* Bulk disable                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Suspending a whole selection.
 *
 * Separate from the status dialog on purpose. The single-account dialog is a
 * choice between three states; this one is a single irreversible-feeling action
 * applied to a list, so it lists the accounts rather than counting them — up to
 * six, which is where a list stops being readable. Below that the count is the
 * honest summary.
 */
export function DisableDialog({
  customers,
  busy = false,
  onClose,
  onConfirm,
}: {
  customers: AdminCustomerRecord[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  if (customers.length === 0) return null;

  // Closed accounts are left as they are, like the already suspended ones.
  const alreadySuspended = customers.filter((c) => c.status !== "active").length;
  const affected = customers.length - alreadySuspended;

  return (
    <Dialog
      open
      onClose={onClose}
      tone="danger"
      icon={<ShieldAlert size={18} />}
      title={
        customers.length === 1
          ? t("admin.customers.disableTitle", { name: customerName(customers[0]) })
          : t("admin.customers.disableTitleMany", { count: customers.length })
      }
      description={t("admin.customers.disableBody")}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <span className="ml-auto">
            <Button size="sm" variant="dark" iconLeft={Ban} disabled={affected === 0 || busy} loading={busy} onClick={onConfirm}>
              {t("admin.customers.disableConfirm", { count: affected })}
            </Button>
          </span>
        </>
      }
    >
      {customers.length > 1 && customers.length <= 6 && (
        <ul className="m-0 grid list-none gap-1.5 p-0">
          {customers.map((customer) => (
            <li
              key={customer.id}
              className="flex items-center gap-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] px-3 py-2"
            >
              <Avatar customer={customer} size={28} />
              <span className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                {customerName(customer)}
              </span>
              <CustomerStatusBadge status={customer.status} size="sm" />
            </li>
          ))}
        </ul>
      )}

      {/* Already-suspended accounts in the selection are called out rather than
          silently skipped: "suspend 12" that only changes 9 is a number the
          operator will later have to explain. */}
      {alreadySuspended > 0 && (
        <p className="m-0 rounded-[var(--radius-sm)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-3 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
          {t("admin.customers.disableAlready", { count: alreadySuspended })}
        </p>
      )}
    </Dialog>
  );
}
