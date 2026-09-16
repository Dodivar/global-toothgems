import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const navigate = useNavigate();
  const { showToast } = useToast();
  const lang = i18n.language;
  const [params, setParams] = useSearchParams();

  const [filter, setFilter] = useState<string>(params.get("categorie") ?? "Tout");
  const [material, setMaterial] = useState("all");
  const [priceBand, setPriceBand] = useState("all");
  const [stockBand, setStockBand] = useState("all");
  const [sort, setSort] = useState("new");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

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

  const resetPage = () => setPage(1);

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

  const hasFilters = filter !== "Tout" || material !== "all" || priceBand !== "all" || stockBand !== "all";
  const activeCount = [filter !== "Tout", material !== "all", priceBand !== "all", stockBand !== "all"].filter(Boolean).length;

  const resetFilters = () => {
    setFilter("Tout");
    setMaterial("all");
    setPriceBand("all");
    setStockBand("all");
    resetPage();
    setParams({});
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
              <Button variant="outline" iconLeft={MenuIcon} fullWidth onClick={() => setFiltersOpen((v) => !v)}>
                {(filtersOpen ? t("shop.filterToggleHide") : t("shop.filterToggleShow")) + (activeCount ? ` · ${activeCount}` : "")}
              </Button>
            </div>
            <div className={`${filtersOpen ? "grid" : "hidden"} gap-5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)] lg:grid`}>
              <div className="grid gap-1">
                <span className="gt-eyebrow">{t("shop.categoryLabel")}</span>
                <div className="grid gap-0.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setFilter(c);
                        resetPage();
                      }}
                      className="rounded-[10px] px-2.5 py-2 text-left text-[length:var(--text-body-sm)]"
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
              <Select label={t("shop.materialLabel")} options={materialOptions} value={material} onChange={(v) => { setMaterial(v); resetPage(); }} />
              <Select label={t("shop.priceLabel")} options={priceOptions} value={priceBand} onChange={(v) => { setPriceBand(v); resetPage(); }} />
              <Select label={t("shop.stockLabel")} options={stockOptions} value={stockBand} onChange={(v) => { setStockBand(v); resetPage(); }} />
              {hasFilters && (
                <Button variant="ghost" size="sm" iconLeft={X} fullWidth onClick={resetFilters}>
                  {t("shop.reset")}
                </Button>
              )}
            </div>
          </aside>

          <div className="grid min-w-0 gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t(filtered.length === 1 ? "shop.resultCount_one" : "shop.resultCount_other", { count: filtered.length, total: PRODUCTS.length })}
              </span>
              <div className="min-w-[200px]">
                <Select label={t("shop.sortLabel")} options={sortOptions} value={sort} onChange={setSort} />
              </div>
            </div>

            {pageItems.length === 0 ? (
              <div className="grid justify-items-start gap-4 py-16 text-center">
                <p className="m-0 text-sm text-[var(--text-muted)]">{t("shop.emptyState")}</p>
                <Button variant="outline" onClick={resetFilters}>{t("shop.emptyReset")}</Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
                {pageItems.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={{
                      id: p.id,
                      name: pick(p.name, lang),
                      subtitle: pick(p.subtitle, lang),
                      price: p.price,
                      compareAtPrice: p.compareAtPrice,
                      image: p.image,
                      badge: p.badge ? pick(p.badge, lang) : undefined,
                      badgeTone: p.badgeTone,
                      rating: p.rating,
                      reviewCount: p.reviewCount,
                      stock: p.stock,
                    }}
                    onSelect={() => navigate(`/boutique/${p.id}`)}
                    onSave={() => showToast(t("product.toastSavedTitle"), t("product.toastSavedBody", { name: pick(p.name, lang) }))}
                  />
                ))}
              </div>
            )}

            {pageCount > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                <Button variant="ghost" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  {t("shop.prev")}
                </Button>
                {Array.from({ length: pageCount }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                    style={{
                      background: safePage === i + 1 ? "var(--gt-ink-900)" : "transparent",
                      color: safePage === i + 1 ? "var(--text-inverse)" : "var(--text-body)",
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
                <Button variant="ghost" size="sm" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>
                  {t("shop.next")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
