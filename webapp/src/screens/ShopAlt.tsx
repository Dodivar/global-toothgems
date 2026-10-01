"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "../lib/navigation";
import { ChevronDown, Heart, SlidersHorizontal, X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { CatalogError } from "../components/shop/CatalogError";
import { FilterPanel, type GroupKey } from "../components/shopAlt/FilterPanel";
import { useFilterLabels } from "../components/shopAlt/useFilterLabels";
import { FilterDrawer } from "../components/shopAlt/FilterDrawer";
import { StorefrontCard, StorefrontCardSkeleton } from "../components/shopAlt/StorefrontCard";
import { useCatalog } from "../lib/catalog/CatalogProvider";
import { useAuth } from "../lib/auth";
import { useFavorites } from "../lib/favorites";
import { isFavoritesView, withFavoritesView } from "../lib/favoritesState";
import { FavoritesEmpty } from "../components/favorites/FavoritesEmpty";
import {
  DEFAULT_SORT,
  FILTER_KEYS,
  FILTER_PARAMS,
  NO_FILTERS,
  SORT_KEYS,
  activeFilterCount,
  filterProducts,
  normalizeTaxonomy,
  readFilters,
  readSort,
  sortProducts,
  withFilter,
  writeFilters,
  type FilterKey,
  type StorefrontFilters,
  type StorefrontSort,
} from "../lib/storefrontFilters";

/** Products revealed per step: whole rows at 2, 3, 4 and 5 columns alike. */
const STEP = 20;

/**
 * Column ladder keyed to the width of the results column itself (a container
 * query), not the viewport: the sidebar takes its share from lg up, so the
 * viewport alone would say nothing about how wide a card ends up. The steps
 * keep every card at roughly 190 px or more, which is what a small gem photo
 * needs to still read as a shape; five columns is the ceiling, so on a wide
 * screen the cards grow rather than multiply.
 */
const GRID =
  "grid grid-cols-2 gap-3 @min-[540px]:grid-cols-3 @min-[540px]:gap-4 @min-[780px]:grid-cols-4 @min-[1000px]:grid-cols-5 @min-[1000px]:gap-5";

/** Sidebar groups open on arrival; the rest are one click away. */
const SIDEBAR_OPEN_GROUPS: GroupKey[] = ["category", "shape", "color", "price"];

/**
 * The alternative shop page, at /boutique: the same catalogue, copy and URL
 * parameters as /boutique, laid out so the products come first — a short
 * introduction, a wide grid, and the filters in a sticky sidebar on the right
 * (a drawer below the lg breakpoint).
 *
 * A layout prototype for comparison. Nothing here touches pricing or stock:
 * the page reads the catalogue like /boutique does and the cart recomputes
 * everything at checkout.
 */
export function ShopAlt() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { products: catalog, status: catalogStatus, source, taxonomy } = useCatalog();
  const { signedIn, restoring } = useAuth();
  const favorites = useFavorites();
  const [params, setParams] = useSearchParams();
  const labelOf = useFilterLabels();
  const sortId = useId();

  // "My favourites" narrows the whole page — grid, counts and filter facets —
  // to the member's favourites; the filters then work within them.
  const favoritesView = isFavoritesView(params);
  const products = favoritesView ? favorites.favoriteProducts : catalog;
  const favoritesLoading = restoring || (signedIn && (favorites.status === "idle" || favorites.status === "loading"));
  const status = favoritesView && catalogStatus === "ready" && favoritesLoading ? "loading" : catalogStatus;
  /** Signed out, or the list could not be read: the favourites view shows why instead of a grid. */
  const favoritesBlocked = favoritesView && !restoring && (!signedIn || favorites.status === "error");
  const toggleFavoritesView = () => {
    if (!favoritesView && !signedIn) {
      favorites.requestAccount();
      return;
    }
    setParams(withFavoritesView(params, !favoritesView));
  };

  const filters = useMemo(() => normalizeTaxonomy(readFilters(params), taxonomy), [params, taxonomy]);
  const sort = readSort(params);
  const activeCount = activeFilterCount(filters);
  const results = useMemo(() => sortProducts(filterProducts(products, filters), sort, lang), [products, filters, sort, lang]);

  // What the grid shows depends on the filters and the sort only; "show more"
  // starts over whenever they change.
  const signature = useMemo(() => {
    const next = new URLSearchParams(params);
    next.delete("page");
    return next.toString();
  }, [params]);
  const [shown, setShown] = useState({ signature, count: STEP });
  const shownCount = shown.signature === signature ? shown.count : STEP;
  const visible = results.slice(0, shownCount);

  // The next step is revealed on its own once the shopper nears the end of the
  // grid. The whole catalogue is already in memory (and cached), so this costs
  // no request: it only keeps the page light to render. The observer is set up
  // again after every step, so if the sentinel is still in range (a tall
  // screen, a short step) it fires again instead of waiting for a scroll.
  // The button stays only where IntersectionObserver does not exist.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [autoLoad, setAutoLoad] = useState(true);
  const hasMore = results.length > visible.length;
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setAutoLoad(false);
      return;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShown({ signature, count: shownCount + STEP });
      },
      // Start early, about two rows ahead, so the next cards are there before the shopper reaches them.
      { rootMargin: "0px 0px 700px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, shownCount, signature]);

  // A short skeleton on each change acknowledges it, instead of the grid
  // snapping to a new length with no sign that anything happened.
  const [pending, setPending] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPending(true);
    const id = window.setTimeout(() => setPending(false), 220);
    return () => window.clearTimeout(id);
  }, [signature]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const setFilters = (next: StorefrontFilters) => setParams(writeFilters(params, next));
  const setFilter = (key: FilterKey, value: string) => setFilters(withFilter(filters, key, value));
  const clearAll = () => setParams(writeFilters(params, NO_FILTERS));
  const setSort = (value: StorefrontSort) => {
    const next = new URLSearchParams(params);
    if (value === DEFAULT_SORT) next.delete("tri");
    else next.set("tri", value);
    next.delete("page");
    setParams(next);
  };
  const applyDrawer = (nextFilters: StorefrontFilters, nextSort: StorefrontSort) => {
    const next = writeFilters(params, nextFilters);
    if (nextSort === DEFAULT_SORT) next.delete("tri");
    else next.set("tri", nextSort);
    setParams(next);
    showResultsAfterClose.current = true;
    setDrawerOpen(false);
  };

  const closeDrawer = useCallback(() => setDrawerOpen(false), [setDrawerOpen]);

  // After applying, the shopper wants the new results, not the spot they
  // scrolled to before: bring the grid's top into view and move focus there.
  // The drawer hands focus back to its opener first, which may be the
  // floating button about to hide, so this runs after it.
  const showResultsAfterClose = useRef(false);
  useEffect(() => {
    if (drawerOpen || !showResultsAfterClose.current) return;
    showResultsAfterClose.current = false;
    resultsRef.current?.focus({ preventScroll: true });
    resultsRef.current?.scrollIntoView({ block: "start" });
  }, [drawerOpen]);

  // The floating button shows only once the toolbar's own filter button has
  // scrolled away, and only while the grid is on screen — never over the
  // introduction, never over the footer.
  const inlineTriggerRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const [inlineTriggerVisible, setInlineTriggerVisible] = useState(true);
  const [resultsVisible, setResultsVisible] = useState(false);
  useEffect(() => {
    const trigger = inlineTriggerRef.current;
    const section = resultsRef.current;
    if (!trigger || !section || typeof IntersectionObserver === "undefined") return;
    // The sticky header covers the top of the viewport, so a button under it counts as gone.
    const triggerObserver = new IntersectionObserver(([entry]) => setInlineTriggerVisible(entry.isIntersecting), {
      rootMargin: "-64px 0px 0px 0px",
    });
    // Hide it a little before the footer arrives, so it never sits on footer links.
    const sectionObserver = new IntersectionObserver(([entry]) => setResultsVisible(entry.isIntersecting), {
      rootMargin: "0px 0px -120px 0px",
    });
    triggerObserver.observe(trigger);
    sectionObserver.observe(section);
    return () => {
      triggerObserver.disconnect();
      sectionObserver.disconnect();
    };
  }, []);
  const floatingVisible = !inlineTriggerVisible && resultsVisible && !drawerOpen;

  // The family is part of the product-type chip ("Toothgems › Swarovski");
  // removing that chip clears both.
  const familyActive = filters.family !== FILTER_PARAMS.family.fallback;
  const chips = FILTER_KEYS.filter((key) => key !== "family" && filters[key] !== FILTER_PARAMS[key].fallback).map((key) => ({
    key,
    label:
      key === "category" && familyActive
        ? `${labelOf("category", filters.category)} › ${labelOf("family", filters.family)}`
        : labelOf(key, filters[key]),
  }));

  const countText =
    status === "loading"
      ? t("catalog.loading")
      : activeCount > 0
        ? t("shopAlt.resultsOf", { count: results.length, total: products.length })
        : t("shopAlt.results", { count: results.length });

  return (
    <div className="gt-shopb">
      <section className="gt-shopb-gutter pb-5 pt-[clamp(20px,3.4vw,44px)]">
        <div className="mx-auto max-w-[var(--max-width-shop)]">
          <div className="grid max-w-[760px] gap-2">
            <span className="gt-eyebrow">
              {t("shop.eyebrow")}
              {catalogStatus === "ready" && <span className="text-[var(--text-subtle)]"> · {t("shopAlt.totalCount", { count: catalog.length })}</span>}
            </span>
            <h1 className="m-0 text-[length:clamp(28px,3.1vw,44px)] font-bold leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--text-primary)]">
              {favoritesView ? t("favorites.title") : t("shop.title")}
            </h1>
            <p className="m-0 max-w-[62ch] text-[length:var(--text-body-sm)] text-[var(--text-body)] sm:text-[length:var(--text-body-md)]">
              {favoritesView ? t("favorites.body") : t("shop.body")}
            </p>
          </div>
        </div>
      </section>

      <section className="gt-shopb-gutter pb-[var(--section-y-sm)]">
        <div className="mx-auto grid max-w-[var(--max-width-shop)] gap-8 lg:grid-cols-[minmax(0,1fr)_264px] xl:gap-10 2xl:grid-cols-[minmax(0,1fr)_288px]">
          {/* First in the DOM, so a keyboard reaches the filters before the
              grid's cards; the grid places it on the right. The skip link
              covers the other case, reaching the products first. */}
          <aside aria-label={t("shopAlt.sidebarLabel")} className="hidden lg:col-start-2 lg:row-start-1 lg:block">
            <div className="gt-shopb-sidebar sticky top-[100px] max-h-[calc(100vh-124px)] overflow-y-auto rounded-[var(--radius-card)] bg-[var(--surface-card)] px-5 pb-2 shadow-[var(--shadow-card)]">
              <a href="#gt-shopb-results" className="gt-shopb-skip sr-only focus:not-sr-only">
                {t("shopAlt.skipToResults")}
              </a>
              <div className="sticky top-0 z-[1] -mx-5 flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 pb-3 pt-4">
                <SlidersHorizontal size={16} aria-hidden="true" className="text-[var(--text-primary)]" />
                <h2 className="m-0 text-[15px] font-bold text-[var(--text-primary)]">{t("shopAlt.filters")}</h2>
                {activeCount > 0 && (
                  <>
                    <span className="text-[13px] text-[var(--text-muted)]">· {t("shopAlt.filtersActive", { count: activeCount })}</span>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="ml-auto text-[12px] font-medium text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
                    >
                      {t("shop.clearAll")}
                    </button>
                  </>
                )}
              </div>
              <FilterPanel filters={filters} onChange={setFilters} products={products} defaultOpen={SIDEBAR_OPEN_GROUPS} />
            </div>
          </aside>

          <section
            ref={resultsRef}
            id="gt-shopb-results"
            tabIndex={-1}
            aria-label={t("shop.gridLabel")}
            className="@container min-w-0 scroll-mt-28 outline-none lg:col-start-1 lg:row-start-1"
          >
            {/* Toolbar: count, then sort, and below lg the filter trigger. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3 sm:gap-x-4">
              <button
                type="button"
                onClick={toggleFavoritesView}
                aria-pressed={favoritesView}
                className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border px-3.5 text-[13px] font-semibold transition-colors"
                style={{
                  borderColor: favoritesView ? "var(--gt-ink-900)" : "var(--border-strong)",
                  background: favoritesView ? "var(--gt-ink-900)" : "var(--surface-card)",
                  color: favoritesView ? "var(--text-inverse)" : "var(--text-primary)",
                }}
              >
                <Heart
                  size={15}
                  aria-hidden="true"
                  fill={favoritesView ? "var(--accent-highlight)" : "none"}
                  color={favoritesView ? "var(--accent-highlight)" : "currentColor"}
                />
                {t("favorites.filter")}
                {signedIn && favorites.favoriteProducts.length > 0 && (
                  <span className="font-normal opacity-80">· {favorites.favoriteProducts.length}</span>
                )}
              </button>
              <span role="status" aria-live="polite" className="mr-auto text-[13px] font-semibold text-[var(--text-primary)]">
                {status === "error" || favoritesBlocked ? null : countText}
              </span>
              <label htmlFor={sortId} className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)]">
                <span className="hidden sm:inline">{t("shopAlt.sortLabel")}</span>
                <span className="relative">
                  <select
                    id={sortId}
                    value={sort}
                    onChange={(e) => setSort(e.target.value as StorefrontSort)}
                    aria-label={t("shopAlt.sortLabel")}
                    className="gt-shopb-sort h-9 appearance-none rounded-[var(--radius-pill)] bg-transparent pl-3 pr-8 text-[13px] font-semibold text-[var(--text-primary)]"
                  >
                    {SORT_KEYS.map((value) => (
                      <option key={value} value={value}>
                        {t(`shopAlt.sorts.${value}`)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-primary)]" />
                </span>
              </label>
              <button
                ref={inlineTriggerRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-haspopup="dialog"
                aria-label={t("shopAlt.filtersButtonAria", { count: activeCount })}
                className="gt-shopb-trigger inline-flex h-9 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-strong)] bg-[var(--surface-card)] px-3.5 text-[13px] font-semibold text-[var(--text-primary)] lg:hidden"
              >
                <SlidersHorizontal size={15} aria-hidden="true" />
                {t("shopAlt.filters")}
                {activeCount > 0 && <CountBubble count={activeCount} />}
              </button>
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pb-4">
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setFilter(chip.key, FILTER_PARAMS[chip.key].fallback)}
                    aria-label={t("shop.removeFilter", { label: chip.label })}
                    className="gt-shopb-chip inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-brand-wash-strong)] py-1.5 pl-3 pr-2.5 text-xs font-semibold text-[var(--text-primary)]"
                  >
                    {chip.label}
                    <X size={12} aria-hidden="true" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={clearAll}
                  className="px-1 text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
                >
                  {t("shop.clearAll")}
                </button>
              </div>
            )}

            {status === "error" ? (
              <CatalogError />
            ) : favoritesBlocked ? (
              <FavoritesEmpty kind={signedIn ? "error" : "signedOut"} onAction={favorites.reload} />
            ) : pending || status === "loading" ? (
              <div className={GRID} aria-hidden="true">
                {Array.from({ length: Math.min(STEP, Math.max(visible.length, 12)) }).map((_, i) => (
                  <StorefrontCardSkeleton key={i} />
                ))}
              </div>
            ) : favoritesView && products.length === 0 ? (
              <FavoritesEmpty kind="empty" onAction={() => setParams(withFavoritesView(params, false))} />
            ) : visible.length === 0 ? (
              <div className="grid justify-items-center gap-3 rounded-[var(--radius-card)] bg-[var(--surface-card)] px-6 py-16 text-center shadow-[var(--shadow-card)]">
                <p className="m-0 text-[length:var(--text-h4)] font-semibold text-[var(--text-primary)]">{t("shopAlt.emptyTitle")}</p>
                <p className="m-0 max-w-[40ch] text-sm text-[var(--text-muted)]">{t("shopAlt.emptyBody")}</p>
                <div className="pt-2">
                  <Button variant="outline" onClick={clearAll}>
                    {t("shop.emptyReset")}
                  </Button>
                </div>
              </div>
            ) : (
              <ul className={`${GRID} m-0 list-none p-0`}>
                {visible.map((p, i) => (
                  <li key={p.id} className="flex">
                    <StorefrontCard
                      product={p}
                      source={source}
                      eager={i < 6}
                      saved={favorites.isFavorite(p)}
                      onSave={() => favorites.toggleFavorite(p)}
                    />
                  </li>
                ))}
              </ul>
            )}

            {!pending && status === "ready" && hasMore && (
              <div ref={sentinelRef} className="grid justify-items-center gap-3 pt-10">
                <span className="text-xs text-[var(--text-muted)]">
                  {t("shopAlt.shown", { shown: visible.length, total: results.length })}
                </span>
                <span aria-hidden="true" className="h-[3px] w-40 overflow-hidden rounded-full bg-[var(--gt-ink-200)]">
                  <span
                    className="block h-full rounded-full bg-[var(--gt-ink-900)]"
                    style={{ width: `${(visible.length / results.length) * 100}%` }}
                  />
                </span>
                {!autoLoad && (
                  <Button variant="outline" onClick={() => setShown({ signature, count: shownCount + STEP })}>
                    {t("shopAlt.showMore")}
                  </Button>
                )}
              </div>
            )}
          </section>
        </div>
      </section>

      {/* Below lg only. Out of the tab order while hidden, so it never takes focus unseen. */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("shopAlt.filtersButtonAria", { count: activeCount })}
        aria-hidden={!floatingVisible}
        tabIndex={floatingVisible ? 0 : -1}
        data-visible={floatingVisible}
        className="gt-shopb-fab fixed bottom-[calc(18px+env(safe-area-inset-bottom))] left-1/2 z-[70] inline-flex h-12 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] pl-4 pr-5 text-[13px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-inverse)] lg:hidden"
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        {t("shopAlt.filters")}
        {activeCount > 0 && <CountBubble count={activeCount} inverse />}
      </button>

      {drawerOpen && (
        <FilterDrawer filters={filters} sort={sort} products={products} onApply={applyDrawer} onClose={closeDrawer} />
      )}
    </div>
  );
}

function CountBubble({ count, inverse = false }: { count: number; inverse?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold leading-none"
      style={{
        background: inverse ? "var(--accent-cta)" : "var(--gt-ink-900)",
        color: inverse ? "var(--gt-ink-900)" : "var(--text-inverse)",
      }}
    >
      {count}
    </span>
  );
}
