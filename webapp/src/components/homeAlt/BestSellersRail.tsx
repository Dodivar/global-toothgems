import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { ProductCard } from "../ui/ProductCard";
import { QuickAdd } from "../shop/QuickAdd";
import { canQuickAdd } from "../../lib/quickAdd";
import { pick } from "../../data/types";
import type { Product } from "../../data/products";
import { useCatalog } from "../../lib/catalog/CatalogProvider";
import { useFavorites } from "../../lib/favorites";
import { useReveal } from "../../lib/useReveal";
import { useScrollRail } from "./useScrollRail";

/** Enough cards for the rail to run past the edge of a wide screen. */
const RAIL_SIZE = 8;

/**
 * The shop's most-loved products, across every category: featured products
 * first, then by number of reviews. `bestSellers()` stops at four gems and kits
 * for the current home page's grid; this rail wants a longer, broader run.
 */
function railProducts(products: Product[]): Product[] {
  return [...products]
    .sort((a, b) => Number(b.isFeatured ?? false) - Number(a.isFeatured ?? false) || b.reviewCount - a.reviewCount)
    .slice(0, RAIL_SIZE);
}

/**
 * Best sellers as an editorial rail: the heading holds a narrow column on the
 * left and the cards run off the right edge of the screen, which says "there is
 * more" better than a closed grid. On a phone the heading stacks above and the
 * rail is swiped.
 */
export function BestSellersRail() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { products, source } = useCatalog();
  const lang = i18n.language;
  const ref = useReveal<HTMLElement>();
  const { ref: railRef, atStart, atEnd, page } = useScrollRail<HTMLUListElement>();

  const items = railProducts(products);

  return (
    <section ref={ref} id="gt-alt-bestsellers" aria-labelledby="gt-alt-bestsellers-title" className="gt-reveal gt-alt-section w-full bg-[var(--surface-card)]">
      <div className="gt-alt-bleed-right grid gap-8 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:gap-[clamp(32px,4vw,72px)]">
        <div className="grid content-between gap-6 pr-[var(--gt-alt-gutter)] lg:pr-0">
          <div className="grid gap-4">
            <span className="gt-eyebrow">{t("homeAlt.bestSellers.eyebrow")}</span>
            <h2 id="gt-alt-bestsellers-title" className="gt-alt-h2">{t("homeAlt.bestSellers.title")}</h2>
            <p className="m-0 max-w-[36ch] text-[length:var(--text-body-md)] text-[var(--text-body)]">{t("homeAlt.bestSellers.body")}</p>
            <div className="pt-2">
              <Button variant="outline" iconRight={ArrowRight} onClick={() => navigate("/boutique")}>
                {t("homeAlt.bestSellers.viewAll")}
              </Button>
            </div>
          </div>
          <div className="hidden gap-2 lg:flex">
            <IconButton icon={ChevronLeft} variant="outline" size="lg" label={t("homeAlt.bestSellers.prev")} disabled={atStart} onClick={() => page(-1)} />
            <IconButton icon={ChevronRight} variant="outline" size="lg" label={t("homeAlt.bestSellers.next")} disabled={atEnd} onClick={() => page(1)} />
          </div>
        </div>

        <ul
          ref={railRef}
          aria-label={t("homeAlt.bestSellers.listLabel")}
          className="gt-scroller gt-alt-rail m-0 flex list-none gap-4 p-0 pb-6 pt-2 sm:gap-6"
        >
          {items.map((p, i) => {
            const name = pick(p.name, lang);
            const quickAdd = canQuickAdd(p, source);
            return (
              <li key={p.id} className="grid w-[clamp(220px,19vw,300px)] flex-none snap-start content-start gap-3">
                <span aria-hidden="true" className="gt-alt-rank">{String(i + 1).padStart(2, "0")}</span>
                <ProductCard
                  to={`/boutique/${p.id}`}
                  eager={i < 3}
                  saved={isFavorite(p)}
                  onSave={() => toggleFavorite(p)}
                  quickAction={
                    quickAdd ? (
                      <QuickAdd
                        product={p}
                        name={name}
                        className="gt-alt-quickadd gt-glass inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-pill)] pl-2.5 pr-3.5 text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--gt-ink-900)] transition-[background-color,opacity,transform] duration-[var(--duration-fast)] hover:bg-white/90 active:scale-[0.97]"
                      />
                    ) : undefined
                  }
                  product={{
                    id: p.id,
                    name,
                    subtitle: pick(p.subtitle, lang),
                    price: p.price,
                    compareAtPrice: p.compareAtPrice,
                    image: p.image,
                    hoverImage: p.gallery?.[1]?.src,
                    badge: i < 2 ? t("homeAlt.bestSellers.badge") : p.badge ? pick(p.badge, lang) : undefined,
                    badgeTone: i < 2 ? "ink" : p.badgeTone,
                    variants: p.variants,
                    stock: p.stock ?? "in",
                  }}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
