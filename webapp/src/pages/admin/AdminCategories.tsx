import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowUpRight, Info } from "lucide-react";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useLocalized } from "../../lib/localized";
import { formatPrice } from "../../lib/format";
import { CATEGORIES, effectivePrice, stockState } from "../../data/adminCatalog";
import { useAdminShell } from "./AdminLayout";

/**
 * How the catalogue is organised.
 *
 * Read-only in the prototype, and it says so: categories are a small, stable
 * set that the storefront navigation is built on, so editing them is a
 * different, riskier job than editing a product, and pretending otherwise here
 * would misrepresent it. What the page does give is the number that matters —
 * how much of the catalogue sits in each one, and how much of that is live.
 */
export function AdminCategories() {
  const { t } = useTranslation();
  const L = useLocalized();
  const { openNav } = useAdminShell();
  const { products } = useAdminCatalog();

  const rows = CATEGORIES.map((category) => {
    const inCategory = products.filter((p) => p.categoryId === category.id);
    const live = inCategory.filter((p) => p.status === "active");
    const unavailable = live.filter((p) => stockState(p) === "out_of_stock");
    const prices = inCategory.map(effectivePrice);
    return {
      category,
      total: inCategory.length,
      active: live.length,
      unavailable: unavailable.length,
      min: prices.length > 0 ? Math.min(...prices) : null,
      max: prices.length > 0 ? Math.max(...prices) : null,
    };
  });

  return (
    <>
      <AdminHeader
        title={t("admin.categories.title")}
        description={t("admin.categories.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.categories") }]}
        onOpenNav={openNav}
      />

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <p className="m-0 flex items-start gap-2.5 rounded-[var(--admin-radius)] bg-[var(--status-info-bg)] p-4 text-[length:var(--text-body-sm)] text-[var(--gt-blue-700)]">
          <Info size={16} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("admin.categories.notice")}
        </p>

        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map(({ category, total, active, unavailable, min, max }) => (
            <li key={category.id} className="gt-admin-panel grid gap-4 p-5">
              <div className="grid gap-1">
                <h2 className="text-[length:var(--text-h4)]">{L(category.name)}</h2>
                <p className="m-0 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
                  {L(category.description)}
                </p>
              </div>

              <dl className="m-0 grid grid-cols-3 gap-3 border-y border-[var(--border-subtle)] py-3.5">
                <div className="grid gap-0.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                    {t("admin.categories.total")}
                  </dt>
                  <dd className="m-0 text-[length:var(--text-h4)] font-bold tabular-nums text-[var(--text-primary)]">
                    {total}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                    {t("admin.categories.active")}
                  </dt>
                  <dd className="m-0 text-[length:var(--text-h4)] font-bold tabular-nums text-[var(--status-success-fg)]">
                    {active}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                    {t("admin.categories.unavailable")}
                  </dt>
                  <dd
                    className={
                      unavailable > 0
                        ? "m-0 text-[length:var(--text-h4)] font-bold tabular-nums text-[var(--status-error-fg)]"
                        : "m-0 text-[length:var(--text-h4)] font-bold tabular-nums text-[var(--text-subtle)]"
                    }
                  >
                    {unavailable}
                  </dd>
                </div>
              </dl>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {min != null && max != null
                    ? t("admin.categories.priceRange", { min: formatPrice(min), max: formatPrice(max) })
                    : t("admin.categories.noProducts")}
                </span>
                <Link
                  to={`/admin/produits?categorie=${category.id}`}
                  className="inline-flex items-center gap-1 rounded-[2px] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-4 transition-colors hover:decoration-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  {t("admin.categories.view")}
                  <ArrowUpRight size={13} strokeWidth={2} aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
