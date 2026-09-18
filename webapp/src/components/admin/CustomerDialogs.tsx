import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Download, Mail, ShieldAlert, UserPlus } from "lucide-react";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { CustomerStatusBadge } from "./CustomerBadges";
import { Avatar } from "./CustomerCells";
import { customerName, type AdminCustomerRecord, type CustomerStatus } from "../../data/adminCustomers";

/**
 * The confirmations of the customer workspace.
 *
 * Three of the four exist because the action behind them is consequential, and
 * the fourth (export) exists because the operator has to choose a scope before
 * anything happens. They share `ui/Dialog`, which owns the focus trap, the
 * Escape handling and the focus return.
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
 * The three statuses are radio buttons with their consequences spelled out
 * underneath, not a select: the difference between "inactive" and "suspended"
 * is exactly what an operator needs explained at the moment of choosing, and a
 * collapsed select shows one option at a time.
 *
 * Confirming is disabled until the choice differs from the current status —
 * a dialog that lets you "confirm" a change to the state you are already in
 * writes a history entry saying something happened when nothing did.
 */
export function StatusDialog({
  customer,
  onClose,
  onConfirm,
}: {
  customer: AdminCustomerRecord | null;
  onClose: () => void;
  onConfirm: (status: CustomerStatus) => void;
}) {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<CustomerStatus>("active");

  // Reopening on a different customer must not inherit the last one's choice.
  useEffect(() => {
    if (customer) setChoice(customer.status);
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
              disabled={choice === customer.status}
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
        {(["active", "inactive", "suspended"] as CustomerStatus[]).map((status) => (
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
function CustomerStatusBadgeIcon({ status }: { status: CustomerStatus }) {
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
  onClose,
  onConfirm,
}: {
  customers: AdminCustomerRecord[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  if (customers.length === 0) return null;

  const alreadySuspended = customers.filter((c) => c.status === "suspended").length;
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
            <Button size="sm" variant="dark" iconLeft={Ban} disabled={affected === 0} onClick={onConfirm}>
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

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

export type ExportScope = "selection" | "filtered" | "all";
export type ExportFormat = "csv" | "xlsx";

/**
 * Choosing what to export.
 *
 * The three scopes carry their own counts, because "export filtered" means
 * nothing until you know it is 4 rows and not 22 — and the difference between
 * those two is the difference between the file being useful and being wrong.
 * The scope defaults to the selection when there is one, which is what the
 * operator who just ticked nine boxes expects.
 */
export function ExportDialog({
  open,
  onClose,
  onConfirm,
  selectionCount,
  filteredCount,
  totalCount,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (scope: ExportScope, format: ExportFormat) => void;
  selectionCount: number;
  filteredCount: number;
  totalCount: number;
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<ExportScope>("filtered");
  const [format, setFormat] = useState<ExportFormat>("csv");

  useEffect(() => {
    if (open) setScope(selectionCount > 0 ? "selection" : "filtered");
  }, [open, selectionCount]);

  if (!open) return null;

  const scopes: { value: ExportScope; count: number; disabled?: boolean }[] = [
    { value: "selection", count: selectionCount, disabled: selectionCount === 0 },
    { value: "filtered", count: filteredCount },
    { value: "all", count: totalCount },
  ];

  const count = scopes.find((s) => s.value === scope)?.count ?? 0;

  return (
    <Dialog
      open
      onClose={onClose}
      icon={<Download size={18} />}
      title={t("admin.customers.exportTitle")}
      description={t("admin.customers.exportBody")}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <span className="ml-auto">
            <Button size="sm" iconLeft={Download} disabled={count === 0} onClick={() => onConfirm(scope, format)}>
              {t("admin.customers.exportConfirm", { count })}
            </Button>
          </span>
        </>
      }
    >
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
          {t("admin.customers.exportScopeLegend")}
        </legend>
        {scopes.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border p-3 transition-colors ${
              option.disabled
                ? "cursor-not-allowed border-[var(--border-subtle)] opacity-45"
                : scope === option.value
                  ? "border-[var(--gt-ink-900)] bg-[var(--surface-sunken)]"
                  : "border-[var(--border-subtle)] hover:bg-[var(--gt-ink-100)]"
            }`}
          >
            <input
              type="radio"
              name="gt-customer-export-scope"
              checked={scope === option.value}
              disabled={option.disabled}
              onChange={() => setScope(option.value)}
              className="h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
            />
            <span className="flex-1 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
              {t(`admin.customers.exportScope.${option.value}`)}
            </span>
            <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
              {t("admin.customers.exportScopeCount", { count: option.count })}
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
          {t("admin.customers.exportFormatLegend")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {(["csv", "xlsx"] as ExportFormat[]).map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-2 text-[length:var(--text-body-sm)] transition-colors ${
                format === value
                  ? "border-[var(--gt-ink-900)] bg-[var(--surface-sunken)] font-semibold text-[var(--text-primary)]"
                  : "border-[var(--border-default)] text-[var(--text-body)] hover:bg-[var(--gt-ink-100)]"
              }`}
            >
              <input
                type="radio"
                name="gt-customer-export-format"
                checked={format === value}
                onChange={() => setFormat(value)}
                className="h-4 w-4 accent-[var(--gt-ink-900)]"
              />
              {t(`admin.customers.exportFormats.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      {/* The prototype's honesty line. An export dialog that produces no file
          without saying so is the one place a mockup can genuinely mislead the
          person reviewing it. */}
      <p className="m-0 rounded-[var(--radius-sm)] bg-[var(--surface-brand-wash)] p-3 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
        {t("admin.customers.exportPrototypeNote")}
      </p>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Email                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Composing a message to one customer or a selection.
 *
 * A compose box rather than a straight "send?" confirmation, because the thing
 * an operator needs to see before sending to nine people is *who* and *what* —
 * and because it is the screen where the marketing opt-out has to be visible.
 * Customers who have opted out are counted and excluded, not silently included.
 */
export function EmailDialog({
  customers,
  onClose,
  onConfirm,
}: {
  customers: AdminCustomerRecord[];
  onClose: () => void;
  onConfirm: (subject: string, recipients: number) => void;
}) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (customers.length > 0) {
      setSubject("");
      setBody("");
    }
  }, [customers]);

  if (customers.length === 0) return null;

  const optedOut = customers.filter((c) => !c.marketingOptIn).length;
  const recipients = customers.length;

  return (
    <Dialog
      open
      onClose={onClose}
      icon={<Mail size={18} />}
      title={
        recipients === 1
          ? t("admin.customers.emailTitle", { name: customerName(customers[0]) })
          : t("admin.customers.emailTitleMany", { count: recipients })
      }
      description={t("admin.customers.emailBody")}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <span className="ml-auto">
            <Button size="sm" iconLeft={Mail} disabled={!subject.trim()} onClick={() => onConfirm(subject.trim(), recipients)}>
              {t("admin.customers.emailConfirm", { count: recipients })}
            </Button>
          </span>
        </>
      }
    >
      <label className="grid gap-1.5">
        <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
          {t("admin.customers.emailSubject")}
        </span>
        <input
          type="text"
          value={subject}
          autoFocus
          onChange={(e) => setSubject(e.target.value)}
          placeholder={t("admin.customers.emailSubjectPlaceholder")}
          className="gt-admin-field"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
          {t("admin.customers.emailMessage")}
        </span>
        <textarea
          value={body}
          rows={4}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("admin.customers.emailMessagePlaceholder")}
          className="gt-admin-field"
        />
      </label>

      {optedOut > 0 && (
        <p className="m-0 rounded-[var(--radius-sm)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-3 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
          {t("admin.customers.emailOptedOut", { count: optedOut })}
        </p>
      )}

      <p className="m-0 rounded-[var(--radius-sm)] bg-[var(--surface-brand-wash)] p-3 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
        {t("admin.customers.emailPrototypeNote")}
      </p>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Add                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Adding a customer.
 *
 * The brief asks for the action but not for real creation, and this is the one
 * place where a convincing mock would be actively dishonest: an administrator
 * shown a working "create customer" form would reasonably conclude the account
 * exists. So the dialog explains what the real flow is — customers create their
 * own accounts, and the back office invites them — and offers the invitation as
 * the simulated action instead.
 */
export function AddCustomerDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (email: string) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (open) setEmail("");
  }, [open]);

  if (!open) return null;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  return (
    <Dialog
      open
      onClose={onClose}
      icon={<UserPlus size={18} />}
      title={t("admin.customers.addTitle")}
      description={t("admin.customers.addBody")}
      closeLabel={t("common.close")}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <span className="ml-auto">
            <Button size="sm" iconLeft={Mail} disabled={!valid} onClick={() => onConfirm(email.trim())}>
              {t("admin.customers.addConfirm")}
            </Button>
          </span>
        </>
      }
    >
      <label className="grid gap-1.5">
        <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
          {t("admin.customers.addEmail")}
        </span>
        <input
          type="email"
          value={email}
          autoFocus
          autoComplete="off"
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("admin.customers.addEmailPlaceholder")}
          className="gt-admin-field"
        />
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.customers.addEmailHint")}
        </span>
      </label>

      <p className="m-0 rounded-[var(--radius-sm)] bg-[var(--surface-brand-wash)] p-3 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
        {t("admin.customers.addPrototypeNote")}
      </p>
    </Dialog>
  );
}
