import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, RefreshCw } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { MetricsRow } from "../../components/admin/MetricsRow";
import { OrdersToolbar } from "../../components/admin/OrdersToolbar";
import { OrderCardList, OrdersTable } from "../../components/admin/OrdersTable";
import { BulkBar } from "../../components/admin/BulkBar";
import { Pagination } from "../../components/admin/Pagination";
import { NoOrdersYet, NoResults, TableSkeleton } from "../../components/admin/OrdersPlaceholders";
import {
  CancelDialog,
  ExportDialog,
  RefundDialog,
  StatusDialog,
  type ExportFormat,
  type ExportScope,
} from "../../components/admin/OrderDialogs";
import { useAdminOrders } from "../../lib/adminOrders";
import { useToast } from "../../lib/toast";
import { formatPrice } from "../../lib/format";
import {
  applyFilters,
  activeFilterCount,
  dateWindow,
  metrics,
  paginate,
  PARAM,
  readFilters,
  type DatePreset,
  type OrderFilters,
  type SortKey,
} from "../../lib/adminOrderFilters";
import { orderTotal, type AdminOrder, type AdminOrderStatus } from "../../data/adminOrders";
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
 * - **`useAdminOrders`** holds the order book, so a status change moves the
 *   badge, the fulfilment column, the KPI row and the order's own timeline at
 *   once rather than just raising a toast.
 * - **This component** holds only what is genuinely transient: which rows are
 *   ticked, which dialog is open, and the short pending flash that stands in
 *   for a request.
 */

/** How long the simulated refetch shows skeleton rows. */
const FILTER_DELAY = 420;

export function Orders() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { orders, setStatus, setStatusMany, refund, cancel, cancelMany } = useAdminOrders();
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
  const filtered = useMemo(() => applyFilters(orders, filters), [orders, filters]);
  const page = useMemo(() => paginate(filtered, filters.page, filters.pageSize), [filtered, filters.page, filters.pageSize]);

  /**
   * The filtering flash.
   *
   * Filtering is synchronous here, so the skeleton exists to show the *shape* of
   * the state a real implementation would have — and it is keyed on the query
   * string rather than on a click, so it also appears when a filter changes from
   * a KPI tile, a chip or a pasted URL.
   *
   * The guard compares the query to the last one seen rather than counting
   * renders: a "first render" boolean is flipped by StrictMode's double effect
   * invocation in development, which made the page open into skeletons with no
   * filter having changed at all.
   */
  const [pending, setPending] = useState(false);
  const querySignature = params.toString();
  const lastQuery = useRef(querySignature);

  useEffect(() => {
    if (lastQuery.current === querySignature) return;
    lastQuery.current = querySignature;
    setPending(true);
    const id = setTimeout(() => setPending(false), FILTER_DELAY);
    return () => clearTimeout(id);
  }, [querySignature]);

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
  const [refundTarget, setRefundTarget] = useState<AdminOrder | null>(null);
  const [cancelTargets, setCancelTargets] = useState<AdminOrder[]>([]);
  const [exportOpen, setExportOpen] = useState(false);

  const notInPrototype = () => showToast(t("common.notIncludedTitle"), t("admin.orders.toastNotWired"), "info");

  const applyStatusToSelection = (status: AdminOrderStatus) => {
    const references = [...selected];
    setStatusMany(references, status);
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
    onRefund: (order: AdminOrder) => setRefundTarget(order),
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
    onInvoice: notInPrototype,
    hrefFor,
  };

  const hasOrders = orders.length > 0;
  const showEmptyResults = !pending && hasOrders && filtered.length === 0;

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
            <span className="mr-1 hidden flex-col items-end sm:flex">
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("admin.orders.revenue")}
              </span>
              <strong className="text-[length:var(--text-h4)] tabular-nums leading-none text-[var(--text-primary)]">
                {formatPrice(overview.revenue)}
              </strong>
            </span>
            <AdminButton
              variant="outline"
              iconLeft={RefreshCw}
              onClick={() => {
                setPending(true);
                setTimeout(() => setPending(false), FILTER_DELAY);
                showToast(t("admin.orders.toastRefreshTitle"), t("admin.orders.toastRefreshBody"), "info");
              }}
            >
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
          activeCount={activeCount}
          onSearch={onSearch}
          onToggleStatus={onToggleStatus}
          onSet={onSet}
          onDatePreset={onDatePreset}
          onReset={onReset}
        />
      </div>

      {!hasOrders ? (
        <NoOrdersYet />
      ) : pending ? (
        <TableSkeleton rows={Math.min(8, Math.max(3, page.items.length || 6))} />
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
        onPrint={notInPrototype}
        onCancel={() => setCancelTargets(selectedOrders)}
      />

      <StatusDialog
        order={statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={(status) => {
          if (!statusTarget) return;
          setStatus(statusTarget.reference, status);
          showToast(
            t("admin.orders.toastStatusTitle", { reference: `#${statusTarget.reference}` }),
            t("admin.orders.toastStatusBody", { status: t(`admin.orders.orderStatus.${status}`) }),
          );
          setStatusTarget(null);
        }}
      />

      <RefundDialog
        order={refundTarget}
        onClose={() => setRefundTarget(null)}
        onConfirm={(amount, full) => {
          if (!refundTarget) return;
          refund(refundTarget.reference, amount, full);
          showToast(
            t("admin.orders.toastRefundTitle", { reference: `#${refundTarget.reference}` }),
            t("admin.orders.toastRefundBody", { amount: formatPrice(amount) }),
          );
          setRefundTarget(null);
        }}
      />

      <CancelDialog
        orders={cancelTargets}
        onClose={() => setCancelTargets([])}
        onConfirm={() => {
          const references = cancelTargets.map((o) => o.reference);
          if (references.length === 1) cancel(references[0]);
          else cancelMany(references);
          showToast(
            references.length === 1
              ? t("admin.orders.toastCancelTitle", { reference: `#${references[0]}` })
              : t("admin.orders.toastCancelTitleMany", { count: references.length }),
            t("admin.orders.toastCancelBody"),
            "warning",
          );
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
            #{page.items[0].reference} · {formatPrice(orderTotal(page.items[0]))}
          </button>
        </p>
      )}
      </div>
    </>
  );
}
