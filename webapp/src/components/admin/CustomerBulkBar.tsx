import { useTranslation } from "react-i18next";
import { Ban, CircleCheck, Download, Mail, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Menu } from "../ui/Menu";
import { CUSTOMER_STATUSES } from "../../data/adminCustomers";
import type { CustomerStatus } from "../../data/adminCustomers";

/**
 * The contextual toolbar for a selection of customers.
 *
 * Absent until something is selected — which is the point: the actions it holds
 * only mean anything against a set of accounts, and a permanently visible row
 * of four buttons would compete with the table for attention all day.
 *
 * Fixed to the bottom of the viewport rather than pinned above the table, so it
 * stays reachable after scrolling to row forty, and it uses the restrained
 * glass surface because it floats over content — one of the few places in this
 * interface where translucency earns its keep.
 *
 * "Disable accounts" is separated by a rule and carries the error tone.
 * Suspending twelve accounts in one click is the single most expensive mistake
 * available on this page, so it is also the only action here that opens a
 * confirmation.
 */
export function CustomerBulkBar({
  count,
  onClear,
  onExport,
  onEmail,
  onStatus,
  onDisable,
}: {
  count: number;
  onClear: () => void;
  onExport: () => void;
  onEmail: () => void;
  onStatus: (status: CustomerStatus) => void;
  onDisable: () => void;
}) {
  const { t } = useTranslation();
  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label={t("admin.customers.bulkLabel")}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[300] flex justify-center px-4"
    >
      <div className="gt-glass pointer-events-auto flex w-full max-w-[820px] flex-wrap items-center gap-2 rounded-[var(--radius-lg)] p-2.5 pl-4">
        <p
          className="m-0 mr-1 flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]"
          aria-live="polite"
        >
          {t("admin.customers.bulkSelected", { count })}
        </p>

        <span className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" iconLeft={Download} onClick={onExport}>
            {t("admin.customers.bulkExport")}
          </Button>
          <Button size="sm" variant="outline" iconLeft={Mail} onClick={onEmail}>
            {t("admin.customers.bulkEmail")}
          </Button>

          {/* Changing status in bulk is a menu rather than three buttons: the
              three statuses are mutually exclusive, and laying them out side by
              side invites clicking the wrong one. "Suspended" is not offered
              here — it has its own confirmed action at the end of the bar. */}
          <Menu
            label={t("admin.customers.bulkStatus")}
            width={220}
            items={CUSTOMER_STATUSES.filter((s) => s !== "suspended").map((status) => ({
              id: status,
              label: t("admin.customers.bulkStatusTo", { status: t(`admin.customers.status.${status}`) }),
              icon: CircleCheck,
              onSelect: () => onStatus(status),
            }))}
            trigger={(props) => (
              <button
                type="button"
                {...props}
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] px-4 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                <CircleCheck size={14} aria-hidden="true" />
                {t("admin.customers.bulkStatus")}
              </button>
            )}
          />
        </span>

        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-[var(--border-default)] sm:block" />

        <button
          type="button"
          onClick={onDisable}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-red-400)] px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Ban size={14} aria-hidden="true" />
          {t("admin.customers.bulkDisable")}
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label={t("admin.customers.bulkClear")}
          className="ml-auto grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] text-[var(--text-muted)] transition-colors hover:bg-white/70 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
