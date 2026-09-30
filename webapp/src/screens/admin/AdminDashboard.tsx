import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Archive, CircleCheck, CircleSlash, PackageSearch, Pencil, Plus, TriangleAlert } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ActivityFeed } from "../../components/admin/ActivityFeed";
import { CardLoadingState } from "../../components/admin/LoadingState";
import { ProductStatusBadge } from "../../components/admin/ProductStatusBadge";
import { StatCard } from "../../components/admin/StatCard";
import { StockIndicator } from "../../components/admin/StockIndicator";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useAdminAuth } from "../../lib/adminAuth";
import { useLocalized } from "../../lib/localized";
import { productEditPath } from "../../lib/adminProductLinks";
import { displayState, matchesStockState, needsRestock, variantAlerts } from "../../data/adminCatalog";
import { useAdminShell } from "./AdminLayout";

/**
 * Landing page of the workspace.
 *
 * Deliberately not an analytics dashboard: no revenue, no curves, no charts the
 * prototype could not honestly fill. It answers the two questions an
 * administrator opens the tool with — what is the catalogue made of, and what
 * needs my attention — and every number on it opens the products it counts.
 */
export function AdminDashboard() {
  const { t } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { admin } = useAdminAuth();
  const { stats, activity, products, loading } = useAdminCatalog();

  /**
   * The shortlist under the cards: live products that need restocking, the
   * product itself or one of its options — the rule the cards count by.
   * Anything sold out comes first.
   */
  const needsAttention = products
    .filter((product) => product.status !== "archived")
    .filter(needsRestock)
    .sort(
      (a, b) =>
        Number(!matchesStockState(a, "out_of_stock")) - Number(!matchesStockState(b, "out_of_stock")),
    )
    .slice(0, 5);

  return (
    <>
      <AdminHeader
        title={t("admin.dashboard.title", { name: admin?.name.split(" ")[0] ?? "" })}
        description={t("admin.dashboard.description")}
        onOpenNav={openNav}
        actions={
          <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/produits/nouveau")}>
            {t("admin.products.create")}
          </AdminButton>
        }
      />

      <div className="grid gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <section aria-label={t("admin.dashboard.statsLabel")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <CardLoadingState key={i} label={t("admin.dashboard.loading")} />)
          ) : (
            <>
              <StatCard
                label={t("admin.dashboard.totalLabel")}
                value={stats.total}
                hint={t("admin.dashboard.totalHint", { archived: stats.archived })}
                icon={PackageSearch}
                tone="brand"
                to="/admin/produits"
                linkLabel={t("admin.dashboard.totalLink")}
              />
              <StatCard
                label={t("admin.dashboard.activeLabel")}
                value={stats.active}
                hint={t("admin.dashboard.activeHint")}
                icon={CircleCheck}
                tone="success"
                to="/admin/produits?statut=active"
                linkLabel={t("admin.dashboard.activeLink")}
              />
              <StatCard
                label={t("admin.dashboard.draftLabel")}
                value={stats.draft}
                hint={t("admin.dashboard.draftHint")}
                icon={Pencil}
                tone="neutral"
                to="/admin/produits?statut=draft"
                linkLabel={t("admin.dashboard.draftLink")}
              />
              <StatCard
                label={t("admin.dashboard.outOfStockLabel")}
                value={stats.outOfStock}
                hint={t("admin.dashboard.outOfStockHint", { count: stats.lowStock })}
                icon={CircleSlash}
                tone={stats.outOfStock > 0 ? "error" : "neutral"}
                to="/admin/produits?disponibilite=out_of_stock"
                linkLabel={t("admin.dashboard.outOfStockLink")}
              />
            </>
          )}
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          {/* Attention list */}
          <section className="gt-admin-panel overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="grid gap-0.5">
                <h2 className="text-[length:var(--text-h4)]">{t("admin.dashboard.attentionTitle")}</h2>
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("admin.dashboard.attentionBody")}
                </p>
              </div>
              <Link
                to="/admin/produits?disponibilite=low_stock"
                className="rounded-[2px] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-4 transition-colors hover:decoration-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {t("admin.dashboard.attentionLink")}
              </Link>
            </header>

            {needsAttention.length === 0 ? (
              <p className="m-0 px-5 py-8 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                {t("admin.dashboard.attentionEmpty")}
              </p>
            ) : (
              <ul className="m-0 grid list-none gap-0 p-0">
                {needsAttention.map((product) => {
                  const alerts = variantAlerts(product);
                  return (
                  <li key={product.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <Link
                      // Straight to the option that needs restocking first.
                      to={productEditPath(product.id, alerts[0])}
                      className="gt-admin-row flex items-center gap-3 px-5 py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                    >
                      {product.media[0] && (
                        <img
                          src={product.media[0].src}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 flex-none rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] object-cover"
                        />
                      )}
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                          {L(product.name)}
                        </span>
                        <span className="font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] text-[var(--text-muted)]">
                          {product.sku}
                        </span>
                        {alerts.length > 0 && (
                          <span className="truncate text-[length:var(--text-caption)] text-[var(--text-body)]">
                            {alerts
                              .slice(0, 2)
                              .map((alert) =>
                                t("admin.dashboard.attentionOption", {
                                  option: L(alert.name),
                                  state: t(`admin.stock.${alert.state}`).toLowerCase(),
                                }),
                              )
                              .join(" · ")}
                            {alerts.length > 2 && ` ${t("admin.dashboard.attentionMoreOptions", { count: alerts.length - 2 })}`}
                          </span>
                        )}
                      </span>
                      <StockIndicator product={product} compact />
                      <ProductStatusBadge state={displayState(product)} size="sm" />
                    </Link>
                  </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Activity */}
          <section className="gt-admin-panel overflow-hidden">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="grid gap-0.5">
                <h2 className="text-[length:var(--text-h4)]">{t("admin.dashboard.activityTitle")}</h2>
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("admin.dashboard.activityBody")}
                </p>
              </div>
            </header>
            <ActivityFeed entries={activity.slice(0, 7)} />
          </section>
        </div>

        {/* What the workspace will become. Stated in words rather than implied
            by five disabled rows in the rail. */}
        <section className="gt-admin-panel flex flex-wrap items-center gap-4 p-5">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 flex-none place-items-center rounded-[var(--admin-radius-sm)] bg-[var(--surface-brand)] text-[var(--gt-ink-900)]"
          >
            <TriangleAlert size={18} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--text-body-md)]">{t("admin.dashboard.scopeTitle")}</h2>
            <p className="m-0 mt-0.5 max-w-[80ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("admin.dashboard.scopeBody")}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border-default)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
            <Archive size={12} strokeWidth={2.2} aria-hidden="true" />
            {t("admin.dashboard.scopeBadge")}
          </span>
        </section>
      </div>
    </>
  );
}
