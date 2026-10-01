import { useTranslation } from "react-i18next";
import { Ban, CircleCheck, X } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * The contextual toolbar for a selection of customers.
 *
 * Absent until something is selected — which is the point: the actions it holds
 * only mean anything against a set of accounts, and a permanently visible row
 * of buttons would compete with the table for attention all day.
 *
 * Fixed to the bottom of the viewport rather than pinned above the table, so it
 * stays reachable after scrolling to row forty, and it uses the restrained
 * glass surface because it floats over content — one of the few places in this
 * interface where translucency earns its keep.
 *
 * "Disable accounts" is separated by a rule and carries the error tone.
 * Suspending twelve accounts in one click is the single most expensive mistake
 * available on this page, so it is also the only action here that opens a
 * confirmation. Exporting and e-mailing a selection are not offered: neither
 * has a server side yet (`AGENTS.md` §4).
 */
export function CustomerBulkBar({
  count,
  busy = false,
  onClear,
  onReactivate,
  onDisable,
}: {
  count: number;
  busy?: boolean;
  onClear: () => void;
  onReactivate: () => void;
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

        <Button size="sm" variant="outline" iconLeft={CircleCheck} disabled={busy} onClick={onReactivate}>
          {t("admin.customers.bulkReactivate")}
        </Button>

        <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-[var(--border-default)] sm:block" />

        <button
          type="button"
          onClick={onDisable}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--gt-red-400)] px-4 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
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
