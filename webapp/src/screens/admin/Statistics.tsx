import { useCallback, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  Ban,
  ChartNoAxesCombined,
  Download,
  FileText,
  Globe2,
  GraduationCap,
  Hourglass,
  Lightbulb,
  PackageCheck,
  PackageSearch,
  PieChart,
  PlugZap,
  RotateCcw,
  RotateCw,
  ShoppingBag,
  Sparkles,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { EmptyState } from "../../components/admin/EmptyState";
import { OverflowMenu } from "../../components/admin/OverflowMenu";
import { DonutChart } from "../../components/admin/stats/DonutChart";
import { EcosystemGrid } from "../../components/admin/stats/EcosystemGrid";
import { GrowthChart } from "../../components/admin/stats/GrowthChart";
import { InsightCards } from "../../components/admin/stats/InsightCards";
import { KpiCard } from "../../components/admin/stats/KpiCard";
import { RankedTable } from "../../components/admin/stats/RankedTable";
import { SplitBar, type Segment } from "../../components/admin/stats/SplitBar";
import { StatList } from "../../components/admin/stats/StatList";
import { StatsPanel } from "../../components/admin/stats/StatsPanel";
import { StatsToolbar } from "../../components/admin/stats/StatsToolbar";
import { ChartSkeleton, KpiSkeleton, RowsSkeleton, StatsError } from "../../components/admin/stats/StatsStates";
import { TopProducts } from "../../components/admin/stats/TopProducts";
import { TrendChart } from "../../components/admin/stats/TrendChart";
import {
  CHART_METRICS,
  PARAM,
  formatPercent,
  readCompare,
  readFilters,
  readMetric,
  useAnalytics,
  type ChartMetric,
  type ProductSortKey,
} from "../../lib/adminAnalytics";
import { formatCount, formatDate, formatPrice } from "../../lib/format";
import { useLocalized } from "../../lib/localized";
import { useToast } from "../../lib/toast";
import { DEFAULT_FILTERS, activeFilterCount, type AnalyticsFilters, type OrderStatusId } from "../../data/adminAnalytics";
import { useAdminShell } from "./AdminLayout";

/**
 * Statistics — the report the whole platform is read from.
 *
 * The page answers seven questions in the order an administrator asks them:
 * what did we take, what is it made of, what sold, who bought, how is the school
 * doing, what needs attention, and where are we selling. Each answer is one
 * panel, and every panel is drawn from a single snapshot — so a filter cannot
 * leave two sections disagreeing about the same period.
 *
 * Everything here is fixture data. There is no query, no reporting API and no
 * export: the export actions confirm what a real one would produce and stop
 * there, which is the honest version of a mockup. The seam a real backend
 * replaces is `data/adminAnalytics.ts`.
 */
export function Statistics() {
  const { t } = useTranslation();
  const L = useLocalized();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const metricGroupId = useId();

  const filters = useMemo(() => readFilters(params), [params]);
  const compare = readCompare(params);
  const metric = readMetric(params);
  const activeFilters = activeFilterCount(filters);

  const [sort, setSort] = useState<ProductSortKey>("revenue");
  const [ascending, setAscending] = useState(false);

  const { snapshot, state, updatedMinutesAgo, refresh, breakConnection } = useAnalytics(filters);
  const loading = state === "loading";

  /**
   * One writer for the whole page, as on the order book: a filter at its
   * default is absent from the URL rather than spelled out, so a shared link
   * stays readable and "is anything filtered" is a lookup, not a parse.
   */
  const write = useCallback(
    (changes: Record<string, string | null>) => {
      // Updated from the previous parameters rather than from the render's
      // closure: two controls changed in the same tick would otherwise write
      // over each other, and the second one would silently drop the first.
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          Object.entries(changes).forEach(([key, value]) => {
            if (value == null || value === "" || value === "all") next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const onFilterChange = useCallback(
    (patch: Partial<AnalyticsFilters>) =>
      write({
        ...(patch.range !== undefined ? { [PARAM.range]: patch.range === DEFAULT_FILTERS.range ? null : patch.range } : {}),
        ...(patch.customFrom !== undefined ? { [PARAM.from]: patch.customFrom } : {}),
        ...(patch.customTo !== undefined ? { [PARAM.to]: patch.customTo } : {}),
        ...(patch.category !== undefined ? { [PARAM.category]: patch.category } : {}),
        ...(patch.product !== undefined ? { [PARAM.product]: patch.product } : {}),
        ...(patch.course !== undefined ? { [PARAM.course]: patch.course } : {}),
        ...(patch.customerType !== undefined ? { [PARAM.customerType]: patch.customerType } : {}),
        ...(patch.country !== undefined ? { [PARAM.country]: patch.country } : {}),
        ...(patch.orderStatus !== undefined ? { [PARAM.orderStatus]: patch.orderStatus } : {}),
      }),
    [write],
  );

  /** Clears the filters and keeps the window: the period was not the problem. */
  const onReset = useCallback(
    () =>
      write({
        [PARAM.category]: null,
        [PARAM.product]: null,
        [PARAM.course]: null,
        [PARAM.customerType]: null,
        [PARAM.country]: null,
        [PARAM.orderStatus]: null,
      }),
    [write],
  );

  const onExport = (format: "csv" | "pdf") =>
    showToast(t(`admin.stats.toasts.${format}Title`), t("admin.stats.toasts.exportBody"), "info");

  const onRefresh = () =>
    refresh(() => showToast(t("admin.stats.toasts.refreshTitle"), t("admin.stats.toasts.refreshBody"), "success"));

  const rangeCaption = t("admin.stats.rangeCaption", {
    from: formatDate(snapshot.start),
    to: formatDate(snapshot.end),
  });

  /* ---------------------------------------------------------------- pieces */

  const customerSegments: Segment[] = [
    { id: "new", label: t("admin.stats.customers.new"), value: snapshot.customers.new, color: "var(--gt-blue-700)" },
    { id: "returning", label: t("admin.stats.customers.returning"), value: snapshot.customers.returning, color: "var(--gt-blue-400)" },
  ];

  const ORDER_SEGMENT_META: Record<OrderStatusId, { color: string; icon: typeof PackageCheck }> = {
    completed: { color: "var(--gt-emerald-600)", icon: PackageCheck },
    pending: { color: "var(--gt-amber-600)", icon: Hourglass },
    cancelled: { color: "var(--gt-ink-400)", icon: Ban },
    refunded: { color: "var(--gt-red-600)", icon: RotateCcw },
  };

  const orderSegments: Segment[] = snapshot.orders.statuses.map((status) => ({
    id: status.id,
    label: t(`admin.stats.orderStatus.${status.id}`),
    value: status.orders,
    color: ORDER_SEGMENT_META[status.id].color,
    icon: ORDER_SEGMENT_META[status.id].icon,
  }));

  const geoTotalRevenue = snapshot.geo.reduce((sum, row) => sum + row.revenue, 0);

  /**
   * Utility actions. Three buttons from `sm` up, and the same actions inside the
   * menu at every width — on a phone the header has room for the page title or
   * for three buttons, and the title wins.
   */
  const utilityActions = [
    { id: "refresh", label: t("admin.stats.actions.refresh"), icon: RotateCw, onSelect: onRefresh },
    { id: "csv", label: t("admin.stats.actions.exportCsv"), icon: Download, onSelect: () => onExport("csv") },
    { id: "pdf", label: t("admin.stats.actions.exportPdf"), icon: FileText, onSelect: () => onExport("pdf") },
  ];

  const headerActions = (
    <>
      <span className="hidden items-center gap-2 sm:flex">
        {utilityActions.map((action) => (
          <AdminButton
            key={action.id}
            variant="outline"
            iconLeft={action.icon}
            onClick={action.onSelect}
            loading={action.id === "refresh" && loading}
            aria-label={action.label}
          >
            <span className="hidden xl:inline">{action.label}</span>
          </AdminButton>
        ))}
      </span>
      <OverflowMenu
        label={t("admin.stats.actions.more")}
        actions={[
          ...utilityActions,
          // The prototype's own states, reachable rather than described. A real
          // screen would not carry these two.
          { id: "loading", label: t("admin.stats.actions.showLoading"), icon: RotateCw, onSelect: () => refresh(), separated: true },
          { id: "error", label: t("admin.stats.actions.showError"), icon: PlugZap, onSelect: breakConnection },
        ]}
      />
    </>
  );

  return (
    <>
      <AdminHeader
        title={t("admin.stats.title")}
        description={t("admin.stats.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.analytics") }]}
        onOpenNav={openNav}
        actions={headerActions}
      />

      <div className="grid gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <StatsToolbar
          filters={filters}
          compare={compare}
          activeFilters={activeFilters}
          updatedMinutesAgo={updatedMinutesAgo}
          onChange={onFilterChange}
          onCompare={(value) => write({ [PARAM.compare]: value ? "1" : null })}
          onReset={onReset}
        />

        {state === "error" ? (
          <StatsError onRetry={() => refresh()} />
        ) : !snapshot.hasData && !loading ? (
          <div className="gt-admin-panel">
            <EmptyState
              icon={ChartNoAxesCombined}
              title={t("admin.stats.empty.title")}
              body={t("admin.stats.empty.body")}
              action={
                activeFilters > 0 ? (
                  <AdminButton variant="dark" onClick={onReset}>
                    {t("admin.stats.filters.reset")}
                  </AdminButton>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* 1 — the headline figures. Two rows rather than one grid: the
                two figures the business is run on take the full width, the six
                supporting ones sit in threes underneath. A single four-column
                grid leaves two empty cells at the end, which reads as a
                rendering fault rather than as a choice. */}
            <section aria-label={t("admin.stats.kpiLabel")} className="grid gap-3">
              <p className="sr-only">{rangeCaption}</p>
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
                {loading
                  ? Array.from({ length: 2 }).map((_, index) => <KpiSkeleton key={index} />)
                  : snapshot.kpis
                      .filter((kpi) => kpi.lead)
                      .map((kpi) => <KpiCard key={kpi.id} kpi={kpi} compare={compare} />)}
              </ul>
              <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {loading
                  ? Array.from({ length: 6 }).map((_, index) => <KpiSkeleton key={index} />)
                  : snapshot.kpis
                      .filter((kpi) => !kpi.lead)
                      .map((kpi) => <KpiCard key={kpi.id} kpi={kpi} compare={compare} />)}
              </ul>
            </section>

            {/* 2 — revenue and orders over time */}
            <StatsPanel
              title={t("admin.stats.chart.title")}
              description={rangeCaption}
              icon={ChartNoAxesCombined}
              actions={
                <fieldset className="m-0 border-0 p-0">
                  <legend className="sr-only">{t("admin.stats.chart.metricLabel")}</legend>
                  <div className="flex gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-sunken)] p-1">
                    {CHART_METRICS.map((id) => {
                      const selected = metric === id;
                      return (
                        <label
                          key={id}
                          className={clsx(
                            "cursor-pointer rounded-[var(--radius-pill)] px-3 py-1 text-[length:var(--text-caption)] font-semibold transition-colors",
                            "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                            selected
                              ? "bg-[var(--admin-panel)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]"
                              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                          )}
                        >
                          <input
                            type="radio"
                            name={metricGroupId}
                            value={id}
                            checked={selected}
                            onChange={() => write({ [PARAM.metric]: id === "revenue" ? null : id })}
                            className="sr-only"
                          />
                          {t(`admin.stats.chart.metric.${id}`)}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              }
            >
              {loading ? (
                <ChartSkeleton label={t("admin.stats.loading")} />
              ) : (
                <TrendChart points={snapshot.series} metric={metric as ChartMetric} compare={compare} step={snapshot.step} />
              )}
            </StatsPanel>

            {/* 3 — what the revenue is made of, and what to notice */}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <StatsPanel
                title={t("admin.stats.breakdown.title")}
                description={t("admin.stats.breakdown.description")}
                icon={PieChart}
              >
                {loading ? (
                  <RowsSkeleton rows={5} label={t("admin.stats.loading")} />
                ) : (
                  <DonutChart
                    data={snapshot.breakdown}
                    total={snapshot.breakdown.reduce((sum, slice) => sum + slice.revenue, 0)}
                  />
                )}
              </StatsPanel>

              <StatsPanel
                title={t("admin.stats.insights.title")}
                description={t("admin.stats.insights.description")}
                icon={Lightbulb}
              >
                {loading ? (
                  <RowsSkeleton rows={4} label={t("admin.stats.loading")} />
                ) : snapshot.insights.length === 0 ? (
                  <EmptyState
                    icon={Sparkles}
                    title={t("admin.stats.insights.emptyTitle")}
                    body={t("admin.stats.insights.emptyBody")}
                  />
                ) : (
                  <div className="[&>ul]:xl:grid-cols-1">
                    <InsightCards insights={snapshot.insights} />
                  </div>
                )}
              </StatsPanel>
            </div>

            {/* 4 — what sold */}
            <StatsPanel
              title={t("admin.stats.products.title")}
              description={t("admin.stats.products.description")}
              icon={PackageSearch}
              collapsible
              bodyClassName="p-4 sm:px-5 sm:pb-5 sm:pt-4"
            >
              {loading ? (
                <RowsSkeleton rows={6} label={t("admin.stats.loading")} />
              ) : snapshot.products.length === 0 ? (
                <EmptyState
                  icon={PackageSearch}
                  title={t("admin.stats.products.emptyTitle")}
                  body={t("admin.stats.products.emptyBody")}
                  action={
                    activeFilters > 0 ? (
                      <AdminButton variant="outline" onClick={onReset}>
                        {t("admin.stats.filters.reset")}
                      </AdminButton>
                    ) : undefined
                  }
                />
              ) : (
                <TopProducts
                  products={snapshot.products}
                  sort={sort}
                  ascending={ascending}
                  onSort={(key, asc) => {
                    setSort(key);
                    setAscending(asc);
                  }}
                />
              )}
            </StatsPanel>

            {/* 5 — who bought, and how the school is doing */}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <StatsPanel
                title={t("admin.stats.customers.title")}
                description={t("admin.stats.customers.description")}
                icon={Users}
              >
                {loading ? (
                  <RowsSkeleton rows={4} label={t("admin.stats.loading")} />
                ) : (
                  <div className="grid gap-5">
                    <SplitBar
                      segments={customerSegments}
                      total={snapshot.customers.new + snapshot.customers.returning}
                      barLabel={t("admin.stats.customers.splitLabel")}
                    />
                    <StatList
                      items={[
                        { id: "total", label: t("admin.stats.customers.total"), value: formatCount(snapshot.customers.total), hint: t("admin.stats.customers.totalHint") },
                        { id: "repeat", label: t("admin.stats.customers.repeatRate"), value: formatPercent(snapshot.customers.repeatRate), hint: t("admin.stats.customers.repeatHint") },
                        { id: "clv", label: t("admin.stats.customers.lifetimeValue"), value: formatPrice(snapshot.customers.lifetimeValue), hint: t("admin.stats.customers.lifetimeHint") },
                        { id: "orders", label: t("admin.stats.customers.lifetimeOrders"), value: formatCount(snapshot.customers.lifetimeOrders), hint: t("admin.stats.customers.ordersHint") },
                      ]}
                    />
                    <div className="grid gap-1.5 border-t border-[var(--border-subtle)] pt-4">
                      <h3 className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                        {t("admin.stats.customers.growthTitle")}
                      </h3>
                      <GrowthChart points={snapshot.customers.growth} step={snapshot.step} />
                    </div>
                  </div>
                )}
              </StatsPanel>

              <StatsPanel
                title={t("admin.stats.training.title")}
                description={t("admin.stats.training.description")}
                icon={GraduationCap}
              >
                {loading ? (
                  <RowsSkeleton rows={4} label={t("admin.stats.loading")} />
                ) : snapshot.training.courses.length === 0 ? (
                  <EmptyState
                    icon={GraduationCap}
                    title={t("admin.stats.training.emptyTitle")}
                    body={t("admin.stats.training.emptyBody")}
                  />
                ) : (
                  <div className="grid gap-5">
                    <StatList
                      columns={3}
                      items={[
                        { id: "enrollments", label: t("admin.stats.training.enrollments"), value: formatCount(snapshot.training.enrollments) },
                        { id: "active", label: t("admin.stats.training.active"), value: formatCount(snapshot.training.activeLearners) },
                        { id: "completed", label: t("admin.stats.training.completed"), value: formatCount(snapshot.training.completed) },
                        { id: "rate", label: t("admin.stats.training.completionRate"), value: formatPercent(snapshot.training.completionRate) },
                        { id: "score", label: t("admin.stats.training.averageScore"), value: `${snapshot.training.averageScore}/100` },
                        { id: "days", label: t("admin.stats.training.timeToComplete"), value: t("admin.stats.training.days", { count: snapshot.training.daysToComplete }) },
                      ]}
                    />
                    <div className="grid gap-2 border-t border-[var(--border-subtle)] pt-4">
                      <h3 className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                        {t("admin.stats.training.rankingTitle")}
                      </h3>
                      <RankedTable
                        caption={t("admin.stats.training.caption")}
                        labelHeader={t("admin.stats.training.course")}
                        color="var(--gt-fuchsia-500)"
                        rows={snapshot.training.courses.map((course) => ({
                          id: course.id,
                          label: L(course.title),
                          sub: L(course.level),
                          share:
                            (course.enrollments /
                              Math.max(1, Math.max(...snapshot.training.courses.map((c) => c.enrollments)))) *
                            100,
                        }))}
                        columns={[
                          {
                            key: "enrollments",
                            label: t("admin.stats.training.enrollments"),
                            value: (id) => formatCount(snapshot.training.courses.find((c) => c.id === id)?.enrollments ?? 0),
                          },
                          {
                            key: "rate",
                            label: t("admin.stats.training.completionShort"),
                            value: (id) => formatPercent(snapshot.training.courses.find((c) => c.id === id)?.completionRate ?? 0, 0),
                          },
                          {
                            key: "score",
                            label: t("admin.stats.training.scoreShort"),
                            secondary: true,
                            value: (id) => `${snapshot.training.courses.find((c) => c.id === id)?.averageScore ?? 0}`,
                          },
                          {
                            key: "revenue",
                            label: t("admin.stats.metric.revenue"),
                            value: (id) => formatPrice(snapshot.training.courses.find((c) => c.id === id)?.revenue ?? 0),
                          },
                        ]}
                      />
                    </div>
                  </div>
                )}
              </StatsPanel>
            </div>

            {/* 6 — how the order book behaved, and where it came from */}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <StatsPanel
                title={t("admin.stats.orders.title")}
                description={t("admin.stats.orders.description")}
                icon={ShoppingBag}
              >
                {loading ? (
                  <RowsSkeleton rows={4} label={t("admin.stats.loading")} />
                ) : (
                  <div className="grid gap-5">
                    <SplitBar
                      segments={orderSegments}
                      total={snapshot.orders.total}
                      barLabel={t("admin.stats.orders.splitLabel")}
                    />
                    <StatList
                      columns={3}
                      items={[
                        { id: "processing", label: t("admin.stats.orders.processing"), value: t("admin.stats.orders.hours", { count: snapshot.orders.processingHours }) },
                        { id: "refund", label: t("admin.stats.orders.refundRate"), value: formatPercent(snapshot.orders.refundRate) },
                        { id: "cancel", label: t("admin.stats.orders.cancelRate"), value: formatPercent(snapshot.orders.cancellationRate) },
                      ]}
                    />
                  </div>
                )}
              </StatsPanel>

              <StatsPanel
                title={t("admin.stats.geo.title")}
                description={t("admin.stats.geo.description")}
                icon={Globe2}
              >
                {loading ? (
                  <RowsSkeleton rows={6} label={t("admin.stats.loading")} />
                ) : (
                  <RankedTable
                    caption={t("admin.stats.geo.caption")}
                    labelHeader={t("admin.stats.geo.country")}
                    rows={snapshot.geo.map((row) => ({
                      id: row.id,
                      label: t(`admin.stats.country.${row.id}`),
                      share: geoTotalRevenue > 0 ? (row.revenue / geoTotalRevenue) * 100 : 0,
                    }))}
                    columns={[
                      {
                        key: "revenue",
                        label: t("admin.stats.metric.revenue"),
                        value: (id) => formatPrice(snapshot.geo.find((row) => row.id === id)?.revenue ?? 0),
                      },
                      {
                        key: "orders",
                        label: t("admin.stats.metric.orders"),
                        value: (id) => formatCount(snapshot.geo.find((row) => row.id === id)?.orders ?? 0),
                      },
                      {
                        key: "customers",
                        label: t("admin.stats.geo.customers"),
                        secondary: true,
                        value: (id) => formatCount(snapshot.geo.find((row) => row.id === id)?.customers ?? 0),
                      },
                    ]}
                  />
                )}
              </StatsPanel>
            </div>

            {/* 7 — the argument for the platform being one platform */}
            <StatsPanel
              title={t("admin.stats.cross.title")}
              description={t("admin.stats.cross.description")}
              icon={Sparkles}
              collapsible
            >
              {loading ? (
                <RowsSkeleton rows={2} label={t("admin.stats.loading")} />
              ) : (
                <EcosystemGrid rows={snapshot.cross} />
              )}
            </StatsPanel>

            <p className="m-0 text-center text-[length:var(--text-caption)] text-[var(--text-subtle)]">
              {t("admin.stats.disclaimer")}
            </p>
          </>
        )}
      </div>
    </>
  );
}
