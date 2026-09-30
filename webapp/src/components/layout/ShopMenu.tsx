import { useMemo } from "react";
import { Link } from "../../lib/navigation";
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
  const ready = status === "ready";

  return (
    <div
      className={clsx(
        columns ? "grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-6 gap-y-8" : "grid gap-6",
      )}
    >
      {groups.map((group, index) => {
        const headingId = `gt-shop-menu-${layout}-${group.slug}`;
        return (
          <section
            key={group.slug}
            aria-labelledby={headingId}
            className="grid content-start gap-3 motion-safe:animate-[gt-menu-in_var(--duration-slow)_var(--ease-out-soft)_both]"
            /* A short cascade across the columns; the panel remounts on every
               open, so it stays well under the time a hover takes to settle. */
            style={{ animationDelay: `${Math.min(index, 4) * 35}ms` }}
          >
            <h3 id={headingId} className="m-0">
              <Link
                to={group.to}
                onClick={onNavigate}
                className="group/heading relative flex items-center justify-between gap-3 border-b border-[var(--border-default)] pb-2.5 outline-none after:absolute after:-bottom-px after:left-0 after:h-[2px] after:w-7 after:bg-[var(--gt-ink-900)] after:transition-[width] after:duration-[var(--duration-slow)] after:ease-[var(--ease-out-soft)] hover:after:w-full focus-visible:after:w-full"
              >
                <span className="flex min-w-0 items-baseline gap-2.5">
                  <span aria-hidden="true" className="text-[10px] font-semibold tabular-nums text-[var(--gt-blue-600)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate text-[13px] font-[var(--weight-black)] uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-primary)]">
                    {group.label}
                  </span>
                </span>
                <ArrowRight
                  size={14}
                  aria-hidden="true"
                  className="flex-none text-[var(--text-muted)] transition-[transform,color] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover/heading:translate-x-0.5 group-hover/heading:text-[var(--text-primary)] group-focus-visible/heading:text-[var(--text-primary)]"
                />
              </Link>
            </h3>
            <ul className={clsx("m-0 grid list-none p-0", columns ? "gap-2.5" : "gap-2")}>
              {group.entries.map((entry) => (
                <li key={entry.key}>
                  <Link
                    to={entry.to}
                    onClick={onNavigate}
                    className={clsx(
                      "group/entry flex items-center rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] text-left shadow-[var(--shadow-card)] outline-none",
                      "transition-[transform,box-shadow,border-color] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
                      "hover:-translate-y-0.5 hover:border-[var(--gt-blue-300)] hover:shadow-[var(--shadow-card-hover)]",
                      "focus-visible:border-[var(--gt-blue-400)] focus-visible:shadow-[var(--shadow-focus),var(--shadow-card-hover)]",
                      columns ? "gap-3 p-2 pr-3" : "gap-3.5 p-2.5 pr-3.5",
                    )}
                  >
                    <span
                      className={clsx(
                        "relative flex-none overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] ring-1 ring-inset ring-[var(--gt-blue-200)]",
                        columns ? "h-14 w-14" : "h-[52px] w-[52px]",
                      )}
                    >
                      <img
                        src={entry.thumb}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] group-hover/entry:scale-110"
                      />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-1">
                      <span className="line-clamp-2 text-[11.5px] font-bold uppercase leading-[1.3] tracking-[var(--tracking-wide)] text-[var(--text-primary)]">
                        {entry.label}
                      </span>
                      {/* Same height loaded or not, so the cards do not jump when
                          the catalogue arrives. The words carry the status; the
                          dot only echoes it. */}
                      <span className="flex h-[18px] min-w-0 items-center">
                        {ready &&
                          (entry.count > 0 ? (
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--text-body)]">
                              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--gt-emerald-500)]" />
                              {t("nav.menuProductCount", { count: entry.count })}
                            </span>
                          ) : (
                            <span className="inline-flex min-w-0 max-w-full items-center truncate whitespace-nowrap rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-2 py-px text-[11px] font-medium text-[var(--text-muted)]">
                              {t("nav.menuComingSoon")}
                            </span>
                          ))}
                      </span>
                    </span>
                    {/* Below xl the four desktop columns are too narrow to spare
                        it; the lift, border and zoom still mark the hover. */}
                    <span
                      aria-hidden="true"
                      className={clsx(columns ? "hidden xl:grid" : "grid", "h-7 w-7 flex-none place-items-center rounded-full bg-[var(--surface-brand-wash)] text-[var(--text-muted)] transition-[background-color,color,transform] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover/entry:translate-x-0.5 group-hover/entry:bg-[var(--gt-ink-900)] group-hover/entry:text-[var(--gt-white)] group-focus-visible/entry:bg-[var(--gt-ink-900)] group-focus-visible/entry:text-[var(--gt-white)]")}
                    >
                      <ArrowRight size={13} />
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
