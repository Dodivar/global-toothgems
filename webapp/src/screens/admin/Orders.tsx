"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "../../lib/navigation";
import { Download, RefreshCw } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { MetricsRow } from "../../components/admin/MetricsRow";
import { OrdersToolbar } from "../../components/admin/OrdersToolbar";
import { OrderCardList, OrdersTable } from "../../components/admin/OrdersTable";
import { BulkBar } from "../../components/admin/BulkBar";
import { Pagination } from "../../components/admin/Pagination";
import { LoadError, NoOrdersYet, NoResults, TableSkeleton } from "../../components/admin/OrdersPlaceholders";
import {
  CancelDialog,
  ExportDialog,
  StatusDialog,
  type ExportFormat,
  type ExportScope,
} from "../../components/admin/OrderDialogs";
import { useAdminOrders } from "../../lib/adminOrders";
import { useAdminInvoices } from "../../lib/adminInvoices";
import { useToast } from "../../lib/toast";
import { useFormat } from "../../lib/format";
import {
  applyFilters,
  activeFilterCount,
  bookToday,
  customerOptions,
  dateWindow,
  metrics,
  paginate,
  PARAM,
  productOptions,
  readFilters,
  type DatePreset,
  type OrderFilters,
  type SortKey,
} from "../../lib/adminOrderFilters";
import { BOOK_LIMIT, type AdminOrder, type AdminOrderStatus } from "../../data/adminOrders";
import { useAdminShell } from "./AdminLayout";

/**
 * Orders — the central back-office workspace.
 *
 * The page's job is to answer six questions without being learned first: how
 * many orders need attention, what arrived last, what is still pending, what
 * shipped, whether a payment is broken, and where order #GT-10480 is. So the
 * reading order is fixed: the header says where you are, the KPI row answers
 * the counting questions *and* filters, the toolbar answers the finding
 * question, and everything below is the table.
 *
 * The page sits inside the existing administration shell: the rail and the
 * sticky `AdminHeader` come from `AdminLayout`, so this file owns the workspace
 * and nothing about the chrome around it.
 *
 * State lives in three places, on purpose:
 *
 * - **The URL** holds what the table is showing (`lib/adminOrderFilters`), so a
 *   filtered view is a shareable link and the back button works.
 * - **`useAdminOrders`** holds the order book read from Supabase (amounts as
 *   recorded, in minor units), re-read after every write, so the badge, the
 *   KPI row and the order's own timeline move together.
 * - **This component** holds only what is genuinely transient: which rows are
 *   ticked and which dialog is open.
 *
 * Filtering, sorting and paging run in the browser over the whole book: the
 * KPI row, the buyers' order counts and the customers workspace all read the
 * same book. `webapp/README.md` (Orders) records the limit and the plan for
 * paging on the server.
 */

export function Orders() {
  const { formatMoney } = useFormat();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { orders, loading, failed, truncated, reload, setStatus, setStatusMany, cancel, cancelMany } = useAdminOrders();
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => readFilters(params), [params]);
  const activeCount = activeFilterCount(filters);

  /* ---------------------------------------------------------------------- */
  /* URL writes                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * One writer for the whole page. Any change to a filter resets the page
   * number — staying on page 3 of a result set that now has one page is the
   * classic way a filtered table looks empty for no reason.
   */
  const write = useCallback(
    (changes: Record<string, string | null | undefined>, keepPage = false) => {
      const next = new URLSearchParams(params);
      Object.entries(changes).forEach(([key, value]) => {
        // A filter at its default is absent from the URL rather than spelled
        // out: `?statut=&paiement=all` is a link nobody can read, and it makes
        // "are any filters on" a parsing question instead of a lookup.
        if (value == null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      });
      if (!keepPage) next.delete(PARAM.page);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const onSearch = useCallback((value: string) => write({ [PARAM.search]: value || null }), [write]);

  const onToggleStatus = useCallback(
    (status: string) => {
      const next = filters.statuses.includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : [...filters.statuses, status];
      write({ [PARAM.statuses]: next.length ? next.join(",") : null });
    },
    [filters.statuses, write],
  );

  const onSet = useCallback(
    (key: keyof OrderFilters, value: string) => {
      const param = PARAM[key as keyof typeof PARAM];
      if (!param) return;
      write({ [param]: value === "0" ? null : value });
    },
    [write],
  );

  const onDatePreset = useCallback(
    (preset: DatePreset, from?: string, to?: string) => {
      write({
        [PARAM.datePreset]: preset === "all" ? null : preset,
        [PARAM.from]: preset === "custom" ? (from ?? filters.from) || null : null,
        [PARAM.to]: preset === "custom" ? (to ?? filters.to) || null : null,
      });
    },
    [write, filters.from, filters.to],
  );

  const onReset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  /* ---------------------------------------------------------------------- */
  /* Results                                                                */
  /* ---------------------------------------------------------------------- */

  const overview = useMemo(() => metrics(orders), [orders]);
  const today = bookToday();
  const filtered = useMemo(() => applyFilters(orders, filters, today), [orders, filters, today]);
  const customers = useMemo(() => customerOptions(orders), [orders]);
  const products = useMemo(() => productOptions(orders, i18n.language), [orders, i18n.language]);
  const page = useMemo(() => paginate(filtered, filters.page, filters.pageSize), [filtered, filters.page, filters.pageSize]);

  const querySignature = params.toString();

  /* ---------------------------------------------------------------------- */
  /* Selection                                                              */
  /* ---------------------------------------------------------------------- */

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // A selection that survives a filter change would let a bulk action touch
  // orders that are no longer on screen. Dropping what is no longer visible is
  // the conservative reading, and it keeps the bar's count honest.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((o) => o.reference));
      const next = new Set([...prev].filter((reference) => visible.has(reference)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const toggle = (reference: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(reference)) next.delete(reference);
      else next.add(reference);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const pageRefs = page.items.map((o) => o.reference);
      const allOn = pageRefs.every((reference) => prev.has(reference));
      const next = new Set(prev);
      pageRefs.forEach((reference) => (allOn ? next.delete(reference) : next.add(reference)));
      return next;
    });

  const selectedOrders = useMemo(
    () => orders.filter((o) => selected.has(o.reference)),
    [orders, selected],
  );

  /* ---------------------------------------------------------------------- */
  /* Dialogs and feedback                                                   */
  /* ---------------------------------------------------------------------- */

  const [statusTarget, setStatusTarget] = useState<AdminOrder | null>(null);
  const [cancelTargets, setCancelTargets] = useState<AdminOrder[]>([]);
  const [exportOpen, setExportOpen] = useState(false);

  const { invoices } = useAdminInvoices();

  const applyStatusToSelection = (status: AdminOrderStatus) => {
    const references = [...selected];
    if (!setStatusMany(references, status)) return;
    setSelected(new Set());
    showToast(
      t("admin.orders.toastBulkStatusTitle", { count: references.length }),
      t("admin.orders.toastBulkStatusBody", { status: t(`admin.orders.orderStatus.${status}`) }),
    );
  };

  const rangeLabel = useMemo(() => {
    const window = dateWindow(filters);
    return window ? `${window.from} → ${window.to}` : t("admin.orders.datePreset.all");
  }, [filters, t]);

  /** Detail path carrying the list's current query, so "back" returns here. */
  const hrefFor = (order: AdminOrder) =>
    `/admin/commandes/${order.reference}${querySignature ? `?${querySignature}` : ""}`;

  const tableProps = {
    orders: page.items,
    selected,
    onToggle: toggle,
    onToggleAll: toggleAll,
    sort: filters.sort,
    onSort: (sort: SortKey) => write({ [PARAM.sort]: sort === "dateDesc" ? null : sort }),
    onAdvance: (order: AdminOrder) => setStatusTarget(order),
    onCancel: (order: AdminOrder) => setCancelTargets([order]),
    onViewCustomer: (order: AdminOrder) => {
      // The customer record is not part of this prototype, so filtering the
      // table by that customer is the honest version of "view customer": it is
      // the part of their history this screen actually holds.
      write({ [PARAM.customer]: order.customer.id });
      showToast(
        t("admin.orders.toastCustomerTitle"),
        t("admin.orders.toastCustomerBody", { name: `${order.customer.firstName} ${order.customer.lastName}` }),
        "info",
      );
    },
    onInvoice: (order: AdminOrder, kind: "print" | "download") => invoices([order], kind),
    hrefFor,
  };

  const hasOrders = orders.length > 0;
  const showEmptyResults = hasOrders && filtered.length === 0;

  return (
    <>
      {/* The workspace's own header, so Orders starts at the same vertical
          position as Products and the Dashboard. The revenue figure rides in
          `actions` rather than in the body: it answers "how is the shop doing"
          and belongs beside the export, not above the table. */}
      <AdminHeader
        title={t("admin.orders.title")}
        description={t("admin.orders.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.orders") }]}
        onOpenNav={openNav}
        actions={
          <>
            {/* Never one figure across currencies: one line per currency. */}
            <span className="mr-1 hidden flex-col items-end sm:flex" title={t("admin.orders.revenueHint")}>
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("admin.orders.revenue")}
              </span>
              {overview.revenue.length === 0 ? (
                <strong className="text-[length:var(--text-h4)] tabular-nums leading-none text-[var(--text-primary)]">—</strong>
              ) : (
                overview.revenue.map((r) => (
                  <strong key={r.currency} className="text-[length:var(--text-h4)] tabular-nums leading-none text-[var(--text-primary)]">
                    {formatMoney(r.amount, r.currency)}
                  </strong>
                ))
              )}
            </span>
            <AdminButton variant="outline" iconLeft={RefreshCw} onClick={reload}>
              {t("admin.orders.refresh")}
            </AdminButton>
            <AdminButton variant="primary" iconLeft={Download} onClick={() => setExportOpen(true)}>
              {t("admin.orders.export")}
            </AdminButton>
          </>
        }
      />

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
      <MetricsRow
        metrics={overview}
        activeStatuses={filters.statuses}
        attentionActive={filters.attention}
        activeFilters={activeCount}
        onSelectStatuses={(statuses) =>
          write({ [PARAM.statuses]: statuses.length ? statuses.join(",") : null, [PARAM.attention]: null })
        }
        onToggleAttention={() => write({ [PARAM.attention]: filters.attention ? null : "1", [PARAM.statuses]: null })}
        onClear={onReset}
      />

      <div className="gt-admin-panel grid gap-4 p-[var(--space-4)]">
        <OrdersToolbar
          filters={filters}
          resultCount={filtered.length}
          customers={customers}
          products={products}
          activeCount={activeCount}
          onSearch={onSearch}
          onToggleStatus={onToggleStatus}
          onSet={onSet}
          onDatePreset={onDatePreset}
          onReset={onReset}
        />
      </div>

      {truncated && (
        <p role="status" className="m-0 rounded-[var(--radius-md)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--status-warning-fg)]">
          {t("admin.orders.truncatedNotice", { count: BOOK_LIMIT })}
        </p>
      )}

      {loading ? (
        <TableSkeleton rows={6} />
      ) : failed ? (
        <LoadError onRetry={reload} />
      ) : !hasOrders ? (
        <NoOrdersYet />
      ) : showEmptyResults ? (
        <NoResults onReset={onReset} />
      ) : (
        <>
          <OrdersTable {...tableProps} />
          <OrderCardList {...tableProps} />
          <Pagination
            page={page}
            onPage={(value) => write({ [PARAM.page]: value === 1 ? null : String(value) }, true)}
            pageSize={filters.pageSize}
            onPageSize={(size) => write({ [PARAM.pageSize]: size === 25 ? null : String(size) })}
          />
        </>
      )}

      <BulkBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onMarkProcessing={() => applyStatusToSelection("processing")}
        onMarkShipped={() => applyStatusToSelection("shipped")}
        onExport={() => setExportOpen(true)}
        onPrint={() => invoices(selectedOrders, "print")}
        onCancel={() => setCancelTargets(selectedOrders)}
      />

      <StatusDialog
        order={statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={(status) => {
          if (!statusTarget) return;
          if (setStatus(statusTarget.reference, status)) {
            showToast(
              t("admin.orders.toastStatusTitle", { reference: `#${statusTarget.reference}` }),
              t("admin.orders.toastStatusBody", { status: t(`admin.orders.orderStatus.${status}`) }),
            );
          }
          setStatusTarget(null);
        }}
      />

      <CancelDialog
        orders={cancelTargets}
        onClose={() => setCancelTargets([])}
        onConfirm={() => {
          const references = cancelTargets.map((o) => o.reference);
          const sent = references.length === 1 ? cancel(references[0]) : cancelMany(references);
          if (sent) {
            showToast(
              references.length === 1
                ? t("admin.orders.toastCancelTitle", { reference: `#${references[0]}` })
                : t("admin.orders.toastCancelTitleMany", { count: references.length }),
              t("admin.orders.toastCancelBody"),
              "warning",
            );
          }
          setCancelTargets([]);
          setSelected(new Set());
        }}
      />

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        selectionCount={selected.size}
        filteredCount={filtered.length}
        totalCount={orders.length}
        rangeLabel={rangeLabel}
        onConfirm={(scope: ExportScope, format: ExportFormat) => {
          const count = scope === "selection" ? selected.size : scope === "filtered" ? filtered.length : orders.length;
          setExportOpen(false);
          showToast(
            t("admin.orders.toastExportTitle"),
            t("admin.orders.toastExportBody", { count, format: t(`admin.orders.exportFormats.${format}`) }),
            "info",
          );
        }}
      />

      {/* The keyboard route into the first row. It sits last in the DOM and is
          only reachable by tabbing past the table, which is exactly where
          someone who has finished reading the list would look for it. */}
      {page.items.length > 0 && (
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.orders.tableHint")}{" "}
          <button
            type="button"
            onClick={() => navigate(hrefFor(page.items[0]))}
            className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            #{page.items[0].reference} · {formatMoney(page.items[0].amounts.total, page.items[0].currency)}
          </button>
        </p>
      )}
      </div>
    </>
  );
}
