import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { Menu as MenuIcon, X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { ProductCard } from "../components/ui/ProductCard";
import { PRODUCTS, type Product } from "../data/products";
import { pick } from "../data/types";
import { useToast } from "../lib/toast";

const CATEGORIES = ["Tout", "Gems", "Outils", "Kits", "Suivi"] as const;
const PER_PAGE = 8;

function materialOf(product: Product): string {
  return product.subtitle.fr.split("·")[0].trim();
}

export function Shop() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const lang = i18n.language;
  const [params, setParams] = useSearchParams();

  // The URL is the single source of truth for filter state, so a filtered view
  // is shareable and the back button steps through filter changes. Previously
  // `categorie` was read once at mount and never written back.
  const filter = params.get("categorie") ?? "Tout";
  const material = params.get("matiere") ?? "all";
  const priceBand = params.get("prix") ?? "all";
  const stockBand = params.get("stock") ?? "all";
  const sort = params.get("tri") ?? "new";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    // Any filter change invalidates the current page number.
    if (key !== "page") next.delete("page");
    setParams(next, { replace: false });
  };

  const materialOptions = [
    { value: "all", label: t("shop.materials.all") },
    { value: "Cristal", label: t("shop.materials.Cristal") },
    { value: "Cristal AB", label: t("shop.materials.Cristal AB") },
    { value: "Swarovski", label: t("shop.materials.Swarovski") },
    { value: "Or 18k", label: t("shop.materials.Or 18k") },
    { value: "Opale de labo", label: t("shop.materials.Opale de labo") },
  ];
  const priceOptions = [
    { value: "all", label: t("shop.priceBands.all") },
    { value: "under30", label: t("shop.priceBands.under30") },
    { value: "30to60", label: t("shop.priceBands.30to60") },
    { value: "over60", label: t("shop.priceBands.over60") },
  ];
  const stockOptions = [
    { value: "all", label: t("shop.stockBands.all") },
    { value: "in", label: t("shop.stockBands.in") },
    { value: "low", label: t("shop.stockBands.low") },
    { value: "out", label: t("shop.stockBands.out") },
  ];
  const sortOptions = [
    { value: "new", label: t("shop.sorts.new") },
    { value: "priceAsc", label: t("shop.sorts.priceAsc") },
    { value: "priceDesc", label: t("shop.sorts.priceDesc") },
    { value: "rating", label: t("shop.sorts.rating") },
  ];

  const filtered = useMemo(() => {
    let list = PRODUCTS.slice();
    if (filter !== "Tout") list = list.filter((p) => p.cat === filter);
    if (material !== "all") list = list.filter((p) => materialOf(p) === material);
    if (priceBand !== "all") {
      list = list.filter((p) => {
        if (priceBand === "under30") return p.price < 30;
        if (priceBand === "30to60") return p.price >= 30 && p.price <= 60;
        return p.price > 60;
      });
    }
    if (stockBand !== "all") {
      list = list.filter((p) => {
        if (stockBand === "in") return p.stock !== "out";
        if (stockBand === "low") return p.stock === "low";
        return p.stock === "out";
      });
    }
    if (sort === "priceAsc") list = list.slice().sort((a, b) => a.price - b.price);
    else if (sort === "priceDesc") list = list.slice().sort((a, b) => b.price - a.price);
    else if (sort === "rating") list = list.slice().sort((a, b) => b.rating - a.rating);
    return list;
  }, [filter, material, priceBand, stockBand, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pageItems = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // A brief skeleton on filter change keeps the grid from snapping to a new
  // length with no acknowledgement that anything happened.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setPending(true);
    const id = setTimeout(() => setPending(false), 220);
    return () => clearTimeout(id);
  }, [filter, material, priceBand, stockBand, sort]);

  // Paging without this leaves the reader at the bottom of the previous page.
  const goToPage = (n: number) => {
    setParam("page", String(n), "1");
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const activeChips = [
    filter !== "Tout" && { key: "categorie", label: t(`shop.categories.${filter}`), fallback: "Tout" },
    material !== "all" && { key: "matiere", label: materialOptions.find((o) => o.value === material)?.label ?? material, fallback: "all" },
    priceBand !== "all" && { key: "prix", label: priceOptions.find((o) => o.value === priceBand)?.label ?? priceBand, fallback: "all" },
    stockBand !== "all" && { key: "stock", label: stockOptions.find((o) => o.value === stockBand)?.label ?? stockBand, fallback: "all" },
  ].filter(Boolean) as { key: string; label: string; fallback: string }[];

  const resetFilters = () => {
    const next = new URLSearchParams();
    if (sort !== "new") next.set("tri", sort);
    setParams(next);
  };

  return (
    <div>
      <section className="px-[clamp(14px,4vw,48px)] pb-8 pt-[clamp(40px,5vw,64px)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-6">
          <div className="grid max-w-[720px] gap-3">
            <span className="gt-eyebrow">{t("shop.eyebrow")}</span>
            <h1 className="text-[length:var(--text-h1)] tracking-[var(--tracking-display)]">{t("shop.title")}</h1>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("shop.body")}</p>
          </div>
        </div>
      </section>

      <section className="px-[clamp(14px,4vw,48px)] pb-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] grid-cols-1 items-start gap-8 lg:grid-cols-[236px_minmax(0,1fr)]">
          <aside className="grid gap-5 lg:sticky lg:top-24">
            <div className="lg:hidden">
              <Button
                variant="outline"
                iconLeft={MenuIcon}
                fullWidth
                aria-expanded={filtersOpen}
                aria-controls="gt-shop-filters"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                {(filtersOpen ? t("shop.filterToggleHide") : t("shop.filterToggleShow")) +
                  (activeChips.length ? ` · ${activeChips.length}` : "")}
              </Button>
            </div>
            <div
              id="gt-shop-filters"
              className={`${filtersOpen ? "grid" : "hidden"} gap-5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)] lg:grid`}
            >
              <div className="grid gap-1">
                <span className="gt-eyebrow" id="gt-category-label">{t("shop.categoryLabel")}</span>
                <div className="grid gap-0.5" role="group" aria-labelledby="gt-category-label">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setParam("categorie", c, "Tout")}
                      aria-pressed={filter === c}
                      className="rounded-[10px] px-2.5 py-2 text-left text-[length:var(--text-body-sm)] transition-colors"
                      style={{
                        fontWeight: filter === c ? 700 : 400,
                        color: filter === c ? "var(--text-primary)" : "var(--text-body)",
                        background: filter === c ? "var(--surface-sunken)" : "transparent",
                      }}
                    >
                      {c === "Tout" ? t("shop.categories.all") : t(`shop.categories.${c}`)}
                    </button>
                  ))}
                </div>
              </div>
              <Select label={t("shop.materialLabel")} options={materialOptions} value={material} onChange={(v) => setParam("matiere", v, "all")} />
              <Select label={t("shop.priceLabel")} options={priceOptions} value={priceBand} onChange={(v) => setParam("prix", v, "all")} />
              <Select label={t("shop.stockLabel")} options={stockOptions} value={stockBand} onChange={(v) => setParam("stock", v, "all")} />
              {activeChips.length > 0 && (
                <Button variant="ghost" size="sm" iconLeft={X} fullWidth onClick={resetFilters}>
                  {t("shop.reset")}
                </Button>
              )}
            </div>
          </aside>

          <div className="grid min-w-0 gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]" role="status" aria-live="polite">
                {t(filtered.length === 1 ? "shop.resultCount_one" : "shop.resultCount_other", {
                  count: filtered.length,
                  total: PRODUCTS.length,
                })}
              </span>
              <div className="min-w-[200px]">
                <Select label={t("shop.sortLabel")} options={sortOptions} value={sort} onChange={(v) => setParam("tri", v, "new")} />
              </div>
            </div>

            {/* Active filters were only removable from inside the sidebar, which
                is collapsed on mobile. Chips make them visible and dismissible. */}
            {activeChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="gt-eyebrow">{t("shop.activeFiltersLabel")}</span>
                {activeChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setParam(chip.key, chip.fallback, chip.fallback)}
                    aria-label={t("shop.removeFilter", { label: chip.label })}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]"
                  >
                    {chip.label}
                    <X size={12} aria-hidden="true" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={resetFilters}
                  className="px-1 text-xs text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
                >
                  {t("shop.clearAll")}
                </button>
              </div>
            )}

            <div ref={gridRef} className="scroll-mt-28">
              {pending ? (
                <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3" aria-hidden="true">
                  {Array.from({ length: Math.min(PER_PAGE, Math.max(filtered.length, 3)) }).map((_, i) => (
                    <div key={i} className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] p-[var(--space-3)]">
                      <div className="gt-skeleton aspect-square rounded-[var(--radius-media)]" />
                      <div className="grid gap-2 pt-3">
                        <div className="gt-skeleton h-3 w-3/4 rounded-full" />
                        <div className="gt-skeleton h-3 w-1/2 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : pageItems.length === 0 ? (
                <div className="grid justify-items-center gap-4 py-16 text-center">
                  <p className="m-0 text-sm text-[var(--text-muted)]">{t("shop.emptyState")}</p>
                  <Button variant="outline" onClick={resetFilters}>{t("shop.emptyReset")}</Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3" aria-label={t("shop.gridLabel")}>
                  {pageItems.map((p, i) => (
                    <ProductCard
                      key={p.id}
                      to={`/boutique/${p.id}`}
                      eager={i < 3}
                      product={{
                        id: p.id,
                        name: pick(p.name, lang),
                        subtitle: pick(p.subtitle, lang),
                        price: p.price,
                        compareAtPrice: p.compareAtPrice,
                        image: p.image,
                        hoverImage: p.gallery?.[1]?.src,
                        badge: p.badge ? pick(p.badge, lang) : undefined,
                        badgeTone: p.badgeTone,
                        rating: p.rating,
                        reviewCount: p.reviewCount,
                        stock: p.stock,
                      }}
                      onSave={() => showToast(t("product.toastSavedTitle"), t("product.toastSavedBody", { name: pick(p.name, lang) }))}
                    />
                  ))}
                </div>
              )}
            </div>

            {pageCount > 1 && (
              <nav aria-label={t("shop.paginationLabel")} className="flex flex-wrap items-center justify-center gap-2 pt-4">
                <Button variant="ghost" size="sm" disabled={safePage <= 1} onClick={() => goToPage(safePage - 1)}>
                  {t("shop.prev")}
                </Button>
                {Array.from({ length: pageCount }).map((_, i) => {
                  const current = safePage === i + 1;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => goToPage(i + 1)}
                      aria-current={current ? "page" : undefined}
                      aria-label={current ? t("shop.currentPage", { page: i + 1 }) : t("shop.goToPage", { page: i + 1 })}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors"
                      style={{
                        background: current ? "var(--gt-ink-900)" : "transparent",
                        color: current ? "var(--text-inverse)" : "var(--text-body)",
                      }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
                <Button variant="ghost" size="sm" disabled={safePage >= pageCount} onClick={() => goToPage(safePage + 1)}>
                  {t("shop.next")}
                </Button>
              </nav>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
