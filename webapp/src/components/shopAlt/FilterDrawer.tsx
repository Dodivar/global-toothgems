import { useCallback, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "../ui/Button";
import { FilterPanel, type GroupKey } from "./FilterPanel";
import type { Product } from "../../data/products";
import { useFocusTrap } from "../../lib/useFocusTrap";
import {
  NO_FILTERS,
  activeFilterCount,
  filterProducts,
  type StorefrontFilters,
  type StorefrontSort,
} from "../../lib/storefrontFilters";

interface FilterDrawerProps {
  filters: StorefrontFilters;
  sort: StorefrontSort;
  products: Product[];
  onApply: (filters: StorefrontFilters, sort: StorefrontSort) => void;
  onClose: () => void;
}

/** Collapsed by default on a phone: the group titles alone are the overview. */
const DRAWER_OPEN_GROUPS: GroupKey[] = [];

/**
 * Filters on phones and tablets: a bottom sheet on a phone, a panel from the
 * right from the tablet width up.
 *
 * The drawer works on a draft: choices stay local until "Show n products"
 * applies them in one step (one history entry), and closing — the ×, Escape or
 * the backdrop — discards them. The apply button counts the draft's results,
 * so nobody applies their way into an empty grid by surprise.
 *
 * Mounted only while open, so the draft starts from the page's current state
 * every time and its radio groups never share names with the sidebar's.
 */
export function FilterDrawer({ filters, sort, products, onApply, onClose }: FilterDrawerProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [draft, setDraft] = useState(filters);
  const [draftSort, setDraftSort] = useState(sort);
  const close = useCallback(() => onClose(), [onClose]);
  const panelRef = useFocusTrap<HTMLDivElement>(true, close);

  const resultCount = useMemo(() => filterProducts(products, draft).length, [products, draft]);
  const active = activeFilterCount(draft);

  return createPortal(
    <div className="fixed inset-0 z-[500]">
      <div aria-hidden="true" className="gt-shopb-backdrop absolute inset-0 bg-[rgba(17,17,17,.38)]" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="gt-shopb-sheet absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[var(--radius-xl)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)] outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[400px] sm:rounded-none sm:rounded-l-[var(--radius-xl)]"
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 flex-none rounded-full bg-[var(--gt-ink-200)] sm:hidden" />
        <header className="flex flex-none items-center gap-3 border-b border-[var(--border-subtle)] px-5 pb-3 pt-3 sm:pt-5">
          <h2 id={titleId} className="m-0 text-[18px] font-bold tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
            {t("shopAlt.filters")}
          </h2>
          {active > 0 && (
            <span className="rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-inverse)]">
              {t("shopAlt.filtersActive", { count: active })}
            </span>
          )}
          <button
            type="button"
            onClick={close}
            aria-label={t("shopAlt.drawerClose")}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
          <FilterPanel
            filters={draft}
            onChange={setDraft}
            products={products}
            defaultOpen={DRAWER_OPEN_GROUPS}
            sort={{ value: draftSort, onChange: setDraftSort }}
          />
        </div>

        <footer className="grid flex-none grid-cols-[auto_minmax(0,1fr)] items-center gap-4 border-t border-[var(--border-subtle)] px-5 pb-[calc(16px+env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            disabled={active === 0}
            onClick={() => setDraft(NO_FILTERS)}
            className="h-11 px-1 text-[13px] font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 disabled:text-[var(--text-subtle)] disabled:no-underline"
          >
            {t("shop.clearAll")}
          </button>
          <Button variant="primary" fullWidth className="min-w-0" disabled={resultCount === 0} onClick={() => onApply(draft, draftSort)}>
            {t("shopAlt.apply", { count: resultCount })}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
