import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { DEFAULT_MENU_THUMB, TAXONOMY_THUMBS } from "../../data/menu";
import { shopHref } from "../../data/taxonomy";
import { pick } from "../../data/types";
import { useCatalog } from "../../lib/catalog/CatalogProvider";

interface MenuEntry {
  key: string;
  label: string;
  to: string;
  thumb: string;
  count: number;
}

interface MenuGroup {
  slug: string;
  label: string;
  to: string;
  /** The families, or the category itself as its single entry when it has none. */
  entries: MenuEntry[];
}

/**
 * The shop's menu entries: one group per category, one entry per family,
 * each linking to the shop with that node of the product-type filter chosen.
 * Counts are the catalogue's active products.
 */
function useShopMenu(): MenuGroup[] {
  const { taxonomy, products } = useCatalog();
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useMemo(() => {
    const countOf = (category: string, family?: string) =>
      products.filter((p) => p.cat === category && (family === undefined || p.family === family)).length;
    return taxonomy.map((category) => {
      const label = pick(category.name, lang);
      const to = shopHref(category.slug);
      const entries =
        category.families.length > 0
          ? category.families.map((family) => ({
              key: family.slug,
              label: pick(family.name, lang),
              to: shopHref(category.slug, family.slug),
              thumb: family.imageUrl ?? TAXONOMY_THUMBS[family.slug] ?? DEFAULT_MENU_THUMB,
              count: countOf(category.slug, family.slug),
            }))
          : [{ key: category.slug, label, to, thumb: TAXONOMY_THUMBS[category.slug] ?? DEFAULT_MENU_THUMB, count: countOf(category.slug) }];
      return { slug: category.slug, label, to, entries };
    });
  }, [taxonomy, products, lang]);
}

/**
 * The shop's part of the header menu: a column per category on a desktop
 * panel, stacked sections in the phone menu. Every family is listed, even
 * one with no product yet ("coming soon"), so the range reads the same
 * whatever the stock.
 */
export function ShopMenu({ layout, onNavigate }: { layout: "columns" | "stack"; onNavigate: () => void }) {
  const { t } = useTranslation();
  const { status } = useCatalog();
  const groups = useShopMenu();
  const columns = layout === "columns";

  const sub = (count: number) =>
    status !== "ready" ? "" : count > 0 ? t("nav.menuProductCount", { count }) : t("nav.menuComingSoon");

  return (
    <div
      className={clsx(
        columns ? "grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-x-5 gap-y-6" : "grid gap-5",
      )}
    >
      {groups.map((group) => {
        const headingId = `gt-shop-menu-${layout}-${group.slug}`;
        return (
          <section key={group.slug} aria-labelledby={headingId} className="grid content-start gap-2.5">
            <h3 id={headingId} className="m-0">
              <Link
                to={group.to}
                onClick={onNavigate}
                className="group inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-primary)] hover:underline hover:decoration-1 hover:underline-offset-4"
              >
                {group.label}
                <ArrowRight size={13} aria-hidden="true" className="text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </h3>
            <ul className="m-0 grid list-none gap-2 p-0">
              {group.entries.map((entry) => (
                <li key={entry.key}>
                  <Link
                    to={entry.to}
                    onClick={onNavigate}
                    className={clsx(
                      "flex items-center rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] text-left shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-md)]",
                      columns ? "gap-3 p-2.5" : "gap-3.5 p-3",
                    )}
                  >
                    <img
                      src={entry.thumb}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={clsx(
                        "flex-none rounded-[var(--radius-sm)] border border-[var(--gt-blue-200)] object-cover",
                        columns ? "h-11 w-11" : "h-[46px] w-[46px]",
                      )}
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span
                        className={clsx(
                          "truncate font-semibold uppercase tracking-[.06em] text-[var(--text-primary)]",
                          columns ? "text-[11px]" : "text-[11.5px]",
                        )}
                      >
                        {entry.label}
                      </span>
                      <span className="min-h-4 text-xs text-[var(--text-muted)]">{sub(entry.count)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
