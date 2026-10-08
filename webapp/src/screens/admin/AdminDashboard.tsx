"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Link, useNavigate, useSearchParams } from "../../lib/navigation";
import { MessageSquareWarning, PackageCheck, Plus, Flag } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { CardLoadingState } from "../../components/admin/LoadingState";
import { SalesChart } from "../../components/admin/SalesChart";
import { StatCard } from "../../components/admin/StatCard";
import { StockIndicator } from "../../components/admin/StockIndicator";
import { Stars } from "../../components/reviews/Stars";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { useAdminAuth } from "../../lib/adminAuth";
import { useAdminOrders } from "../../lib/adminOrders";
import {
  buildSalesSeries,
  DASHBOARD_WINDOWS,
  DEFAULT_DASHBOARD_WINDOW,
  ordersToShip,
  readDashboardWindow,
} from "../../lib/adminDashboard";
import { formatCount, formatMoney, useFormat } from "../../lib/format";
import { useLocalized } from "../../lib/localized";
import { productEditPath } from "../../lib/adminProductLinks";
import { isReported } from "../../lib/reviewRules";
import { useReviews, useReviewAuthor, useReviewSubjects } from "../../lib/reviews";
import { matchesStockState, needsRestock, variantAlerts } from "../../data/adminCatalog";
import { useAdminShell } from "./AdminLayout";

/** Products and reviews listed under their panel; the rest is behind "see all". */
const SHORTLIST = 5;
/** A review at or below this rating is a complaint to answer first. */
const CRITICAL_RATING = 3;

const PANEL_HEADER = "flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4";
const TEXT_LINK =
  "rounded-[2px] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline decoration-[var(--border-default)] underline-offset-4 transition-colors hover:decoration-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * Landing page of the workspace: what the shop needs from the administrator
 * today, and how it is selling.
 *
 * Only what asks for an action is listed — orders to ship, reviews to
 * moderate (the critical ones first), products out of stock or running low —
 * each with its total and a way to see the rest, so the page never turns into
 * a long list. The sales chart reads the live order book; nothing here is
 * invented.
 */
export function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const L = useLocalized();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { admin } = useAdminAuth();
  const { products, loading: catalogLoading } = useAdminCatalog();
  const { orders, loading: ordersLoading, failed: ordersFailed, truncated } = useAdminOrders();
  const { reviews, loading: reviewsLoading } = useReviews();
  const { formatDateShort } = useFormat();
  const reviewAuthor = useReviewAuthor();
  const { subjectName } = useReviewSubjects();
  const [params, setParams] = useSearchParams();
  const [now] = useState(() => new Date());

  const windowDays = readDashboardWindow(params.get("periode"));
  const setWindow = (days: number) => {
    const next = new URLSearchParams(params);
    if (days === DEFAULT_DASHBOARD_WINDOW) next.delete("periode");
    else next.set("periode", String(days));
    setParams(next, { replace: true });
  };

  /* ------------------------------------------------------------ to do */
  const toShip = useMemo(() => ordersToShip(orders), [orders]);

  const pendingReviews = useMemo(
    () =>
      reviews
        .filter((review) => review.status === "pending")
        .sort((a, b) => a.rating - b.rating || a.submittedAt.localeCompare(b.submittedAt)),
    [reviews],
  );
  const criticalPending = pendingReviews.filter((review) => review.rating <= CRITICAL_RATING).length;
  const reportedCount = useMemo(() => reviews.filter(isReported).length, [reviews]);

  /* ------------------------------------------------------------ stock */
  const impacted = useMemo(
    () =>
      products
        .filter((product) => product.status !== "archived")
        .filter(needsRestock)
        // Sold out first, then the rule the cards and the list filter share.
        .sort((a, b) => Number(!matchesStockState(a, "out_of_stock")) - Number(!matchesStockState(b, "out_of_stock"))),
    [products],
  );
  const outOfStock = impacted.filter((product) => matchesStockState(product, "out_of_stock")).length;
  const lowStock = impacted.length - outOfStock;
  const stockLink = `/admin/produits?disponibilite=${outOfStock > 0 ? "out_of_stock" : "low_stock"}`;

  /* ------------------------------------------------------------ sales */
  const series = useMemo(() => buildSalesSeries(orders, windowDays, now), [orders, windowDays, now]);
  const money = (minor: number | null) => (minor === null ? "–" : formatMoney(minor, series.currency, i18n.language));
  const salesTotals = [
    { label: t("admin.dashboard.sales.revenue"), value: money(series.totals.revenue) },
    { label: t("admin.dashboard.sales.basket"), value: money(series.totals.averageBasket) },
    { label: t("admin.dashboard.sales.products"), value: formatCount(series.totals.products, i18n.language) },
    { label: t("admin.dashboard.sales.courses"), value: formatCount(series.totals.courses, i18n.language) },
  ];

  const todoLoading = ordersLoading || reviewsLoading;

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
        {/* To do */}
        <section aria-label={t("admin.dashboard.todoLabel")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {todoLoading ? (
            Array.from({ length: 3 }).map((_, i) => <CardLoadingState key={i} label={t("admin.dashboard.loading")} />)
          ) : (
            <>
              <StatCard
                label={t("admin.dashboard.shipLabel")}
                value={toShip.length}
                hint={t("admin.dashboard.shipHint")}
                icon={PackageCheck}
                tone={toShip.length > 0 ? "warning" : "neutral"}
                to="/admin/commandes?statut=confirmed,processing"
                linkLabel={t("admin.dashboard.shipLink")}
              />
              <StatCard
                label={t("admin.dashboard.reviewsLabel")}
                value={pendingReviews.length}
                hint={
                  criticalPending > 0
                    ? t("admin.dashboard.reviewsHintCritical", { count: criticalPending })
                    : t("admin.dashboard.reviewsHint")
                }
                icon={MessageSquareWarning}
                tone={criticalPending > 0 ? "error" : pendingReviews.length > 0 ? "warning" : "neutral"}
                to="/admin/avis?vue=file&statut=pending&tri=ratingLow"
                linkLabel={t("admin.dashboard.reviewsLink")}
              />
              <StatCard
                label={t("admin.dashboard.reportedLabel")}
                value={reportedCount}
                hint={t("admin.dashboard.reportedHint")}
                icon={Flag}
                tone={reportedCount > 0 ? "error" : "neutral"}
                to="/admin/avis?vue=signalements"
                linkLabel={t("admin.dashboard.reportedLink")}
              />
            </>
          )}
        </section>

        {/* Sales */}
        <section className="gt-admin-panel overflow-hidden">
          <header className={PANEL_HEADER}>
            <div className="grid gap-0.5">
              <h2 className="text-[length:var(--text-h4)]">{t("admin.dashboard.sales.title")}</h2>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.dashboard.sales.body")}</p>
            </div>
            <div role="group" aria-label={t("admin.dashboard.sales.windowLabel")} className="inline-flex rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] p-0.5">
              {DASHBOARD_WINDOWS.map((days) => (
                <button
                  key={days}
                  type="button"
                  aria-pressed={windowDays === days}
                  onClick={() => setWindow(days)}
                  className={clsx(
                    "rounded-[calc(var(--admin-radius-sm)-2px)] px-3 py-1.5 text-[length:var(--text-caption)] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
                    windowDays === days
                      ? "bg-[var(--gt-ink-900)] text-[var(--gt-off-white)]"
                      : "text-[var(--text-body)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  {t(`admin.dashboard.sales.window${days}`)}
                </button>
              ))}
            </div>
          </header>

          {ordersLoading ? (
            <div className="p-5">
              <CardLoadingState label={t("admin.dashboard.loading")} />
            </div>
          ) : ordersFailed ? (
            <p role="alert" className="m-0 px-5 py-8 text-center text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
              {t("admin.dashboard.sales.failed")}
            </p>
          ) : (
            <div className="grid gap-5 p-5">
              <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
                {salesTotals.map((total) => (
                  <div key={total.label} className="grid gap-0.5">
                    <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{total.label}</dt>
                    <dd className="m-0 text-[length:var(--text-h4)] font-bold tabular-nums text-[var(--text-primary)]">{total.value}</dd>
                  </div>
                ))}
              </dl>
              {series.totals.orders === 0 ? (
                <p className="m-0 py-6 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                  {t("admin.dashboard.sales.empty")}
                </p>
              ) : (
                <SalesChart series={series} />
              )}
              {truncated && (
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.dashboard.sales.truncated")}</p>
              )}
            </div>
          )}
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-2">
          {/* Stock */}
          <section className="gt-admin-panel overflow-hidden">
            <header className={PANEL_HEADER}>
              <div className="grid gap-0.5">
                <h2 className="text-[length:var(--text-h4)]">{t("admin.dashboard.stockTitle")}</h2>
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {catalogLoading ? t("admin.dashboard.loading") : t("admin.dashboard.stockSummary", { out: outOfStock, low: lowStock })}
                </p>
              </div>
              {impacted.length > 0 && (
                <Link to={stockLink} className={TEXT_LINK}>
                  {t("admin.dashboard.seeAll", { count: impacted.length })}
                </Link>
              )}
            </header>

            {impacted.length === 0 ? (
              <p className="m-0 px-5 py-8 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                {t("admin.dashboard.stockEmpty")}
              </p>
            ) : (
              <>
                <ul className="m-0 grid list-none gap-0 p-0">
                  {impacted.slice(0, SHORTLIST).map((product) => {
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
                            {alerts.length > 0 && (
                              <span className="truncate text-[length:var(--text-caption)] text-[var(--text-body)]">
                                {alerts
                                  .slice(0, 2)
                                  .map((alert) =>
                                    t("admin.dashboard.stockOption", {
                                      option: L(alert.name),
                                      state: t(`admin.stock.${alert.state}`).toLowerCase(),
                                    }),
                                  )
                                  .join(" · ")}
                                {alerts.length > 2 && ` ${t("admin.dashboard.stockMoreOptions", { count: alerts.length - 2 })}`}
                              </span>
                            )}
                          </span>
                          <StockIndicator product={product} compact />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {impacted.length > SHORTLIST && (
                  <p className="m-0 border-t border-[var(--border-subtle)] px-5 py-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {t("admin.dashboard.stockMore", { count: impacted.length - SHORTLIST })}
                  </p>
                )}
              </>
            )}
          </section>

          {/* Reviews */}
          <section className="gt-admin-panel overflow-hidden">
            <header className={PANEL_HEADER}>
              <div className="grid gap-0.5">
                <h2 className="text-[length:var(--text-h4)]">{t("admin.dashboard.reviewsTitle")}</h2>
                <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("admin.dashboard.reviewsBody")}</p>
              </div>
              {pendingReviews.length > 0 && (
                <Link to="/admin/avis?vue=file&statut=pending&tri=ratingLow" className={TEXT_LINK}>
                  {t("admin.dashboard.seeAll", { count: pendingReviews.length })}
                </Link>
              )}
            </header>

            {reviewsLoading ? (
              <p className="m-0 px-5 py-8 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                {t("admin.dashboard.loading")}
              </p>
            ) : pendingReviews.length === 0 ? (
              <p className="m-0 px-5 py-8 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                {t("admin.dashboard.reviewsEmpty")}
              </p>
            ) : (
              <>
                <ul className="m-0 grid list-none gap-0 p-0">
                  {pendingReviews.slice(0, SHORTLIST).map((review) => (
                    <li key={review.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                      <Link
                        to={`/admin/avis?vue=file&avis=${encodeURIComponent(review.id)}`}
                        className="gt-admin-row grid gap-1 px-5 py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Stars rating={review.rating} size={13} />
                          {review.rating <= CRITICAL_RATING && (
                            <span className="rounded-[var(--radius-pill)] bg-[var(--status-error-bg)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--status-error-fg)]">
                              {t("admin.dashboard.reviewsCritical")}
                            </span>
                          )}
                          <span className="ml-auto text-[length:var(--text-caption)] text-[var(--text-muted)]">
                            {formatDateShort(review.submittedAt)}
                          </span>
                        </span>
                        <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                          {review.title || review.body}
                        </span>
                        <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                          {reviewAuthor(review)} · {subjectName(review.subject, i18n.language)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                {pendingReviews.length > SHORTLIST && (
                  <p className="m-0 border-t border-[var(--border-subtle)] px-5 py-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {t("admin.dashboard.reviewsMore", { count: pendingReviews.length - SHORTLIST })}
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
