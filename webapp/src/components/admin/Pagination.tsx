import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { PAGE_SIZES, pageWindow, type Page } from "../../lib/adminOrderFilters";

/**
 * Paging for the admin tables.
 *
 * The range and the total come from the actual filtered array, never from a
 * constant: "Showing 1–25 of 248" above twelve rows is the first thing a
 * reviewer catches, and it is also the first thing that makes an operator stop
 * trusting the numbers on the screen.
 *
 * The controls are domain-neutral but the *copy* is not — "Showing 1–25 of 248
 * orders" is wrong above a table of customers. So the two sentences that name
 * the rows are passed in as translation keys, defaulting to the orders wording
 * this component was written for.
 */
export function Pagination({
  page,
  onPage,
  pageSize,
  onPageSize,
  rangeKey = "admin.orders.paginationRange",
  navLabelKey = "admin.orders.paginationLabel",
}: {
  page: Page<unknown>;
  onPage: (page: number) => void;
  pageSize: number;
  onPageSize: (size: number) => void;
  /** Takes `from`, `to` and `total`. */
  rangeKey?: string;
  /** Accessible name of the page-number navigation. */
  navLabelKey?: string;
}) {
  const { t } = useTranslation();
  const numbers = pageWindow(page.page, page.pageCount);

  const stepClass =
    "grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] disabled:pointer-events-none disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]" aria-live="polite">
        {t(rangeKey, {
          from: page.firstIndex,
          to: page.lastIndex,
          total: page.total,
        })}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.orders.perPage")}
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="h-9 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 text-[length:var(--text-caption)] text-[var(--text-primary)] outline-none focus:border-[var(--focus-ring)]"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>

        <nav aria-label={t(navLabelKey)} className="flex items-center gap-1">
          <button
            type="button"
            className={stepClass}
            disabled={page.page <= 1}
            onClick={() => onPage(page.page - 1)}
            aria-label={t("admin.orders.previousPage")}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>

          {/* Page numbers only once there is more than one page; on a phone the
              ellipsis window keeps this to five controls at most. */}
          {page.pageCount > 1 &&
            numbers.map((number, index) =>
              number === null ? (
                <span
                  key={`gap-${index}`}
                  aria-hidden="true"
                  className="px-1 text-[length:var(--text-caption)] text-[var(--text-subtle)]"
                >
                  …
                </span>
              ) : (
                <button
                  key={number}
                  type="button"
                  onClick={() => onPage(number)}
                  aria-current={number === page.page ? "page" : undefined}
                  className={clsx(
                    "grid h-9 min-w-9 place-items-center rounded-[var(--radius-pill)] px-2 text-[length:var(--text-caption)] tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                    number === page.page
                      ? "bg-[var(--surface-inverse)] font-semibold text-[var(--text-inverse)]"
                      : "border border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:bg-[var(--gt-ink-100)]",
                  )}
                >
                  {number}
                </button>
              ),
            )}

          <button
            type="button"
            className={stepClass}
            disabled={page.page >= page.pageCount}
            onClick={() => onPage(page.page + 1)}
            aria-label={t("admin.orders.nextPage")}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      </div>
    </div>
  );
}
