import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Download, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { holdsMoney, type AdminOrder, type AdminOrderStatus } from "../../data/adminOrders";
import { OrderStatusBadge } from "./StatusBadges";

/**
 * The three dialogs the orders page opens: update status, cancel, export.
 *
 * Status changes and cancellations are written to Supabase by
 * `lib/adminOrders.tsx`; nothing here reaches a payment provider, a carrier or
 * a mailbox, so each dialog says plainly what it will and will not do. Parcels
 * and refunds have their own dialogs (`FulfillmentDialogs.tsx`): a refund is a
 * Stripe call whose webhook writes the new state (`AGENTS.md` §8). The export
 * is not wired yet and says so.
 */

/**
 * The statuses set by hand. "Shipped" and "delivered" follow the parcels, and
 * "refunded" follows a refund confirmed by Stripe: none of them is a decision
 * of this dialog (a manual "refunded" would claim money nobody returned).
 */
const MANUAL_STATUSES: AdminOrderStatus[] = ["pending", "confirmed", "processing", "cancelled"];

/** Radio-style option row, used by the export choices. */
function Option({
  name,
  checked,
  onChange,
  title,
  hint,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <label
      className={clsx(
        "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-3 transition-colors",
        checked ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-100)]" : "border-[var(--border-subtle)] hover:bg-[var(--surface-sunken)]",
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
      />
      <span className="grid gap-0.5">
        <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{title}</span>
        {hint && <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</span>}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */

export function StatusDialog({
  order,
  onClose,
  onConfirm,
}: {
  order: AdminOrder | null;
  onClose: () => void;
  onConfirm: (status: AdminOrderStatus) => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AdminOrderStatus>(order?.status ?? "pending");

  useEffect(() => {
    if (order) setStatus(order.status);
  }, [order]);

  return (
    <Dialog
      open={Boolean(order)}
      onClose={onClose}
      closeLabel={t("common.close")}
      title={t("admin.orders.statusDialogTitle")}
      description={order ? t("admin.orders.statusDialogBody", { reference: `#${order.reference}` }) : undefined}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("admin.orders.dialogKeep")}
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!order || status === order.status}
            onClick={() => onConfirm(status)}
          >
            {t("admin.orders.statusDialogConfirm")}
          </Button>
        </>
      }
    >
      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="sr-only">{t("admin.orders.statusDialogTitle")}</legend>
        {MANUAL_STATUSES.map((value) => (
          <label
            key={value}
            className={clsx(
              "flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 transition-colors",
              status === value
                ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-100)]"
                : "border-[var(--border-subtle)] hover:bg-[var(--surface-sunken)]",
            )}
          >
            <input
              type="radio"
              name="gt-order-status"
              checked={status === value}
              onChange={() => setStatus(value)}
              className="h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
            />
            <OrderStatusBadge status={value} size="sm" />
            {order?.status === value && (
              <span className="ml-auto text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("admin.orders.statusDialogCurrent")}
              </span>
            )}
          </label>
        ))}
      </fieldset>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.orders.statusDialogNote")}</p>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

export function CancelDialog({
  orders,
  onClose,
  onConfirm,
}: {
  /** One order from a row action, or the whole selection from the bulk bar. */
  orders: AdminOrder[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const many = orders.length > 1;
  const paid = orders.filter(holdsMoney);

  return (
    <Dialog
      open={orders.length > 0}
      onClose={onClose}
      closeLabel={t("common.close")}
      tone="danger"
      icon={<Ban size={17} aria-hidden="true" />}
      title={many ? t("admin.orders.cancelDialogTitleMany", { count: orders.length }) : t("admin.orders.cancelDialogTitle")}
      description={
        many
          ? t("admin.orders.cancelDialogBodyMany")
          : orders[0]
            ? t("admin.orders.cancelDialogBody", { reference: `#${orders[0].reference}` })
            : undefined
      }
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("admin.orders.cancelDialogKeep")}
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--gt-red-600)] px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-white transition-colors hover:bg-[var(--gt-red-500)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <Ban size={14} aria-hidden="true" />
            {many ? t("admin.orders.cancelDialogConfirmMany") : t("admin.orders.cancelDialogConfirm")}
          </button>
        </>
      }
    >
      <ul className="m-0 grid list-none gap-2 p-0">
        <li className="flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-[var(--gt-ink-400)]" />
          {t("admin.orders.cancelConsequenceStock")}
        </li>
        <li className="flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-[var(--gt-ink-400)]" />
          {t("admin.orders.cancelConsequenceGiftCards")}
        </li>
        <li className="flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-[var(--gt-ink-400)]" />
          {t("admin.orders.cancelConsequenceNoEmail")}
        </li>
        {paid.length > 0 && (
          <li className="flex items-start gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--status-error-fg)]">
            <TriangleAlert size={14} aria-hidden="true" className="mt-[3px] flex-none" />
            {t("admin.orders.cancelConsequencePaid", { count: paid.length })}
          </li>
        )}
      </ul>

      {/* The references being cancelled, spelled out. A bulk destructive action
          that only says "12 orders" is an action nobody can check. */}
      {many && (
        <p className="m-0 max-h-[96px] overflow-auto rounded-[var(--radius-sm)] bg-[var(--surface-sunken)] p-2.5 text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
          {orders.map((o) => `#${o.reference}`).join("  ·  ")}
        </p>
      )}
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

export type ExportScope = "selection" | "filtered" | "all";
export type ExportFormat = "csv" | "xlsx" | "pdf";

export function ExportDialog({
  open,
  onClose,
  onConfirm,
  selectionCount,
  filteredCount,
  totalCount,
  rangeLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (scope: ExportScope, format: ExportFormat) => void;
  selectionCount: number;
  filteredCount: number;
  totalCount: number;
  /** Human reading of the date filter currently in force. */
  rangeLabel: string;
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<ExportScope>(selectionCount > 0 ? "selection" : "filtered");
  const [format, setFormat] = useState<ExportFormat>("csv");

  // Opening the dialog with rows selected should default to those rows; opening
  // it from the header should default to what the table is showing.
  useEffect(() => {
    if (open) setScope(selectionCount > 0 ? "selection" : "filtered");
  }, [open, selectionCount]);

  const count = scope === "selection" ? selectionCount : scope === "filtered" ? filteredCount : totalCount;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeLabel={t("common.close")}
      icon={<Download size={17} aria-hidden="true" />}
      title={t("admin.orders.exportDialogTitle")}
      description={t("admin.orders.exportDialogBody")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("admin.orders.dialogKeep")}
          </Button>
          <Button size="sm" className="ml-auto" disabled={count === 0} onClick={() => onConfirm(scope, format)}>
            {t("admin.orders.exportDialogConfirm", { count })}
          </Button>
        </>
      }
    >
      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
          {t("admin.orders.exportScope")}
        </legend>
        <Option
          name="gt-export-scope"
          checked={scope === "selection"}
          onChange={() => setScope("selection")}
          title={t("admin.orders.exportScopeSelection", { count: selectionCount })}
          hint={selectionCount === 0 ? t("admin.orders.exportScopeSelectionEmpty") : undefined}
        />
        <Option
          name="gt-export-scope"
          checked={scope === "filtered"}
          onChange={() => setScope("filtered")}
          title={t("admin.orders.exportScopeFiltered", { count: filteredCount })}
          hint={rangeLabel}
        />
        <Option
          name="gt-export-scope"
          checked={scope === "all"}
          onChange={() => setScope("all")}
          title={t("admin.orders.exportScopeAll", { count: totalCount })}
        />
      </fieldset>

      <fieldset className="m-0 grid gap-1.5 border-0 p-0">
        <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
          {t("admin.orders.exportFormat")}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(["csv", "xlsx", "pdf"] as ExportFormat[]).map((value) => (
            <label
              key={value}
              className={clsx(
                "flex cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border px-3.5 py-2 text-[length:var(--text-body-sm)] transition-colors",
                format === value
                  ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-100)] font-semibold text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--text-body)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              <input
                type="radio"
                name="gt-export-format"
                checked={format === value}
                onChange={() => setFormat(value)}
                className="h-4 w-4 accent-[var(--gt-ink-900)]"
              />
              {t(`admin.orders.exportFormats.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.orders.exportDialogNote")}</p>
    </Dialog>
  );
}
