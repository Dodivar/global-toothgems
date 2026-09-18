import { useTranslation } from "react-i18next";
import { SearchX, UsersRound } from "lucide-react";
import { Button } from "../ui/Button";

/**
 * What the customer list shows when it has nothing to show, and while it is
 * fetching.
 *
 * Neither is styled as an error. "No customers match your filters" is a normal
 * outcome of filtering, and a page that answers it with a red panel trains
 * people to fear their own search box. The way out is always the same, so the
 * reset action is always to hand.
 */

/** The table's loading state: rows of the right shape, not a spinner. */
export function CustomerTableSkeleton({ rows = 8 }: { rows?: number }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)]"
    >
      <span className="sr-only">{t("admin.customers.loading")}</span>
      <div className="grid gap-px bg-[var(--border-subtle)]">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 bg-[var(--surface-card)] px-4 py-[18px]">
            <span className="gt-skeleton h-4 w-4 flex-none rounded-[3px]" />
            <span className="gt-skeleton h-9 w-9 flex-none rounded-full" />
            <span className="grid flex-1 gap-1.5">
              <span className="gt-skeleton h-3 w-[46%] rounded-full" />
              <span className="gt-skeleton h-2.5 w-[24%] rounded-full" />
            </span>
            <span className="gt-skeleton hidden h-3 w-[150px] flex-none rounded-full sm:block" />
            <span className="gt-skeleton h-3 w-[60px] flex-none rounded-full" />
            <span className="gt-skeleton hidden h-6 w-[84px] flex-none rounded-[var(--radius-pill)] md:block" />
            <span className="gt-skeleton hidden h-6 w-[76px] flex-none rounded-[var(--radius-pill)] lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The base itself is empty — a state this prototype's seed never reaches. */
export function NoCustomersYet({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-[clamp(32px,7vw,64px)] text-center">
      <span
        aria-hidden="true"
        className="grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]"
      >
        <UsersRound size={22} />
      </span>
      <h2 className="text-[length:var(--text-h4)]">{t("admin.customers.emptyNoCustomersTitle")}</h2>
      <p className="m-0 max-w-[44ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {t("admin.customers.emptyNoCustomersBody")}
      </p>
      <Button size="sm" variant="outline" onClick={onAdd}>
        {t("admin.customers.addCustomer")}
      </Button>
    </div>
  );
}

export function NoCustomerResults({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-[clamp(32px,7vw,64px)] text-center">
      <span
        aria-hidden="true"
        className="grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-[var(--surface-sunken)] text-[var(--text-muted)]"
      >
        <SearchX size={22} />
      </span>
      <h2 className="text-[length:var(--text-h4)]">{t("admin.customers.emptyNoResultsTitle")}</h2>
      <p className="m-0 max-w-[46ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
        {t("admin.customers.emptyNoResultsBody")}
      </p>
      <Button size="sm" variant="outline" onClick={onReset}>
        {t("admin.customers.clearFilters")}
      </Button>
    </div>
  );
}
