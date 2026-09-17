import { useTranslation } from "react-i18next";
import { PackageSearch, SearchX } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * What the table shows when it has nothing to show, and while it is fetching.
 *
 * Neither is styled as an error. "No orders match your search" is a normal
 * outcome of filtering, and a page that answers it with a red panel trains
 * people to fear their own search box. Both states keep the reset action to
 * hand, because the way out of an empty result is always the same.
 */

/** The table's loading state: rows of the right shape, not a spinner. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)]"
    >
      <span className="sr-only">{t("admin.orders.loading")}</span>
      <div className="grid gap-px bg-[var(--border-subtle)]">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 bg-[var(--surface-card)] px-4 py-[18px]">
            <span className="gt-skeleton h-4 w-4 flex-none rounded-[3px]" />
            <span className="gt-skeleton h-4 w-[92px] flex-none rounded-[var(--radius-xs)]" />
            <span className="gt-skeleton h-8 w-8 flex-none rounded-full" />
            <span className="gt-skeleton hidden h-4 flex-1 rounded-[var(--radius-xs)] sm:block" />
            <span className="gt-skeleton h-4 w-[70px] flex-none rounded-[var(--radius-xs)]" />
            <span className="gt-skeleton hidden h-6 w-[84px] flex-none rounded-[var(--radius-pill)] md:block" />
            <span className="gt-skeleton hidden h-6 w-[84px] flex-none rounded-[var(--radius-pill)] lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function NoOrdersYet() {
  const { t } = useTranslation();
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-[clamp(32px,7vw,64px)] text-center">
      <span
        aria-hidden="true"
        className="grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]"
      >
        <PackageSearch size={22} />
      </span>
      <h2 className="text-[length:var(--text-h4)]">{t("admin.orders.emptyNoOrdersTitle")}</h2>
      <p className="m-0 max-w-[42ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {t("admin.orders.emptyNoOrdersBody")}
      </p>
    </div>
  );
}

export function NoResults({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-[clamp(32px,7vw,64px)] text-center">
      <span
        aria-hidden="true"
        className="grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-[var(--surface-sunken)] text-[var(--text-muted)]"
      >
        <SearchX size={22} />
      </span>
      <h2 className="text-[length:var(--text-h4)]">{t("admin.orders.emptyNoResultsTitle")}</h2>
      <p className="m-0 max-w-[46ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {t("admin.orders.emptyNoResultsBody")}
      </p>
      <Button size="sm" variant="outline" onClick={onReset}>
        {t("admin.orders.clearFilters")}
      </Button>
    </div>
  );
}
