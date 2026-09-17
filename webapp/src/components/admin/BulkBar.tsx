import { useTranslation } from "react-i18next";
import { Ban, Download, PackageOpen, Printer, Truck, X } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * The contextual toolbar for a selection.
 *
 * Absent until something is selected — which is the point: the actions it holds
 * only mean anything against a set of orders, and a permanently visible row of
 * five buttons would compete with the table for attention all day.
 *
 * Fixed to the bottom of the viewport rather than pinned above the table, so it
 * stays reachable after scrolling to row forty, and it uses the restrained
 * glass surface because it floats over content — one of the few places in this
 * interface where translucency earns its keep.
 *
 * "Cancel orders" is separated by a rule and carries the error tone. Destructive
 * bulk actions are how an operator loses an afternoon.
 */
export function BulkBar({
  count,
  onClear,
  onMarkProcessing,
  onMarkShipped,
  onExport,
  onPrint,
  onCancel,
}: {
  count: number;
  onClear: () => void;
  onMarkProcessing: () => void;
  onMarkShipped: () => void;
  onExport: () => void;
  onPrint: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  if (count === 0) return null;

  return (
    <div
      role="region"
      aria-label={t("admin.orders.bulkLabel")}
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[300] flex justify-center px-4"
    >
      <div className="gt-glass pointer-events-auto flex w-full max-w-[860px] flex-wrap items-center gap-2 rounded-[var(--radius-lg)] p-2.5 pl-4">
        <p
          className="m-0 mr-1 flex items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]"
          aria-live="polite"
        >
          {t("admin.orders.bulkSelected", { count })}
        </p>

        <span className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" iconLeft={PackageOpen} onClick={onMarkProcessing}>
            {t("admin.orders.bulkProcessing")}
          </Button>
          <Button size="sm" variant="outline" iconLeft={Truck} onClick={onMarkShipped}>
            {t("admin.orders.bulkShipped")}
          </Button>
          <Button size="sm" variant="ghost" iconLeft={Download} onClick={onExport}>
            {t("admin.orders.bulkExport")}
          </Button>
          <Button size="sm" variant="ghost" iconLeft={Printer} onClick={onPrint}>
            {t("admin.orders.bulkPrint")}
          </Button>
        </span>

        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-[var(--border-default)] sm:block" />

        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-red-400)] px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <Ban size={14} aria-hidden="true" />
          {t("admin.orders.bulkCancel")}
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label={t("admin.orders.bulkClear")}
          className="ml-auto grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] text-[var(--text-muted)] transition-colors hover:bg-white/70 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
