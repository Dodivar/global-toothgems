"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "../../lib/navigation";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { CustomerMetricsRow } from "../../components/admin/CustomerMetricsRow";
import { CustomersToolbar } from "../../components/admin/CustomersToolbar";
import { CustomerCardList, CustomersTable } from "../../components/admin/CustomersTable";
import { CustomerBulkBar } from "../../components/admin/CustomerBulkBar";
import { Pagination } from "../../components/admin/Pagination";
import {
  CustomerTableSkeleton,
  CustomersLoadError,
  NoCustomerResults,
  NoCustomersYet,
} from "../../components/admin/CustomersPlaceholders";
import { DisableDialog, StatusDialog } from "../../components/admin/CustomerDialogs";
import { useAdminCustomers, type CustomerWriteError } from "../../lib/adminCustomers";
import { useAdminOrders } from "../../lib/adminOrders";
import { BOOK_LIMIT } from "../../data/adminOrders";
import { useToast } from "../../lib/toast";
import {
  activeFilterCount,
  applyFilters,
  localToday,
  metrics,
  paginate,
  PARAM,
  readFilters,
  tagsInUse,
  type CustomerDatePreset,
  type CustomerFilters,
  type CustomerSortKey,
} from "../../lib/adminCustomerFilters";
import {
  customerName,
  lastOrderAt,
  type AdminCustomerRecord,
  type CustomerStatus,
  type StaffSettableStatus,
} from "../../data/adminCustomers";
import { useAdminShell } from "./AdminLayout";

/**
 * Customers — the customer base of the back office, read from Supabase.
 *
 * The page answers five questions without being learned first: how large the
 * base is, how much of it is active, who signed up recently, who is studying,
 * and where a given person is. The reading order matches Orders: the header
 * says where you are, the KPI row answers the counting questions *and*
 * filters, the toolbar answers the finding question, and everything below is
 * the table.
 *
 * State lives in three places, on purpose, exactly as it does on Orders:
 *
 * - **The URL** holds what the table is showing (`lib/adminCustomerFilters`),
 *   so a filtered view is a shareable link and the back button works.
 * - **`useAdminCustomers`** holds the base and every write; each write re-reads
 *   it, so a suspension moves the badge and the "Active" tile from what the
 *   database now says.
 * - **This component** holds only what is transient: which rows are ticked,
 *   which dialog is open, and whether a write is in flight.
 *
 * Account actions need `manage_customers`; read-only staff see the base without
 * them. Customers create their own accounts, so there is no "add" action.
 */

export function Customers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { customers, loading, failed, available, ordersTruncated, reload, canManage, setStatus } = useAdminCustomers();
  const { orders } = useAdminOrders();
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
        // out: `?statut=&formation=all` is a link nobody can read.
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
      const next = (filters.statuses as string[]).includes(status)
        ? filters.statuses.filter((s) => s !== status)
        : [...filters.statuses, status as CustomerStatus];
      write({ [PARAM.statuses]: next.length ? next.join(",") : null });
    },
    [filters.statuses, write],
  );

  const onSet = useCallback(
    (key: keyof CustomerFilters, value: string) => {
      const param = PARAM[key as keyof typeof PARAM];
      if (!param) return;
      write({ [param]: value });
    },
    [write],
  );

  const onDatePreset = useCallback(
    (preset: CustomerDatePreset, from?: string, to?: string) => {
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

  const today = localToday();
  const overview = useMemo(() => metrics(customers, today), [customers, today]);
  const filtered = useMemo(() => applyFilters(customers, filters, today), [customers, filters, today]);
  const page = useMemo(
    () => paginate(filtered, filters.page, filters.pageSize),
    [filtered, filters.page, filters.pageSize],
  );
  const availableTags = useMemo(() => tagsInUse(customers), [customers]);

  /** Last order per customer of the page, computed once rather than per row. */
  const lastOrders = useMemo(() => {
    const map = new Map<string, string>();
    page.items.forEach((customer) => {
      const at = lastOrderAt(customer, orders);
      if (at) map.set(customer.id, at);
    });
    return map;
  }, [page.items, orders]);

  /* ---------------------------------------------------------------------- */
  /* Selection                                                              */
  /* ---------------------------------------------------------------------- */

  const [selected, setSelected] = useState<Set<string>>(new Set());

  // A selection that survives a filter change would let a bulk action touch
  // accounts that are no longer on screen. Dropping what is no longer visible
  // is the conservative reading, and it keeps the bar's count honest.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(filtered.map((c) => c.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const ids = page.items.map((c) => c.id);
      const allOn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });

  const selectedCustomers = useMemo(
    () => customers.filter((c) => selected.has(c.id)),
    [customers, selected],
  );

  /* ---------------------------------------------------------------------- */
  /* Writes and feedback                                                    */
  /* ---------------------------------------------------------------------- */

  const [statusTarget, setStatusTarget] = useState<AdminCustomerRecord | null>(null);
  const [disableTargets, setDisableTargets] = useState<AdminCustomerRecord[]>([]);
  const [busy, setBusy] = useState(false);

  const refused = (error: CustomerWriteError) =>
    showToast(t("admin.customers.writeErrorTitle"), t(`admin.customers.writeError.${error}`), "error");

  /** Changes the status of `targets`; true when the database accepted it. */
  const changeStatus = async (targets: AdminCustomerRecord[], status: StaffSettableStatus): Promise<boolean> => {
    setBusy(true);
    const result = await setStatus(targets.map((c) => c.id), status);
    setBusy(false);
    if (!result.ok) {
      refused(result.error);
      return false;
    }
    if (result.changed === 0) return true;
    if (status === "suspended") {
      showToast(
        result.changed === 1 && targets.length === 1
          ? t("admin.customers.toastDisableTitle", { name: customerName(targets[0]) })
          : t("admin.customers.toastDisableTitleMany", { count: result.changed }),
        t("admin.customers.toastDisableBody"),
        "warning",
      );
    } else if (targets.length === 1) {
      showToast(
        t("admin.customers.toastStatusTitle", { name: customerName(targets[0]) }),
        t("admin.customers.toastStatusBody", { status: t(`admin.customers.status.${status}`) }),
      );
    } else {
      showToast(
        t("admin.customers.toastBulkStatusTitle", { count: result.changed }),
        t("admin.customers.toastBulkStatusBody", { status: t(`admin.customers.status.${status}`) }),
      );
    }
    return true;
  };

  /** Detail path carrying the list's current query, so "back" returns here. */
  const querySignature = params.toString();
  const hrefFor = (customer: AdminCustomerRecord) =>
    `/admin/clients/${customer.id}${querySignature ? `?${querySignature}` : ""}`;

  /** The detail page, opened straight onto one of its tabs. */
  const hrefForTab = (customer: AdminCustomerRecord, tab: string) => {
    const next = new URLSearchParams(params);
    next.set("onglet", tab);
    return `/admin/clients/${customer.id}?${next.toString()}`;
  };

  const tableProps = {
    customers: page.items,
    selected,
    onToggle: toggle,
    onToggleAll: toggleAll,
    sort: filters.sort,
    onSort: (sort: CustomerSortKey) => write({ [PARAM.sort]: sort === "recentDesc" ? null : sort }),
    onEdit: (customer: AdminCustomerRecord) => navigate(hrefForTab(customer, "edition")),
    onViewOrders: (customer: AdminCustomerRecord) => navigate(hrefForTab(customer, "commandes")),
    onViewTraining: (customer: AdminCustomerRecord) => navigate(hrefForTab(customer, "formation")),
    // The operator's own mail client: the shop sends no message from here.
    onEmail: (customer: AdminCustomerRecord) => window.location.assign(`mailto:${customer.email}`),
    onToggleAccount: (customer: AdminCustomerRecord) => {
      // Reactivating is not destructive, so it does not need a confirmation —
      // it opens the status dialog, where the operator sees what each status
      // means. Suspending goes straight to the confirmation.
      if (customer.status === "suspended") setStatusTarget(customer);
      else setDisableTargets([customer]);
    },
    canManage,
    lastOrders,
    hrefFor,
  };

  const hasCustomers = customers.length > 0;
  const showEmptyResults = hasCustomers && filtered.length === 0;

  return (
    <>
      <AdminHeader
        title={t("admin.customers.title")}
        description={t("admin.customers.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.customers") }]}
        onOpenNav={openNav}
      />

      <div className="grid gap-4 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <CustomerMetricsRow
          metrics={overview}
          activeFilters={activeCount}
          activeStatuses={filters.statuses}
          trainingActive={filters.training === "has"}
          activityActive={filters.activity === "repeat"}
          dateActive={filters.datePreset === "last30"}
          onSelectStatus={(status) =>
            write({
              [PARAM.statuses]:
                filters.statuses.length === 1 && filters.statuses[0] === status ? null : status,
            })
          }
          onToggleTraining={() => write({ [PARAM.training]: filters.training === "has" ? null : "has" })}
          onToggleRepeat={() => write({ [PARAM.activity]: filters.activity === "repeat" ? null : "repeat" })}
          onToggleNew={() => write({ [PARAM.datePreset]: filters.datePreset === "last30" ? null : "last30" })}
          onClear={onReset}
        />

        <div className="gt-admin-panel grid gap-4 p-[var(--space-4)]">
          <CustomersToolbar
            filters={filters}
            resultCount={filtered.length}
            activeCount={activeCount}
            availableTags={availableTags}
            onSearch={onSearch}
            onToggleStatus={onToggleStatus}
            onSet={onSet}
            onDatePreset={onDatePreset}
            onReset={onReset}
          />
        </div>

        {ordersTruncated && (
          <p
            role="status"
            className="m-0 rounded-[var(--radius-md)] border border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--status-warning-fg)]"
          >
            {t("admin.customers.ordersTruncatedNotice", { count: BOOK_LIMIT })}
          </p>
        )}

        {loading ? (
          <CustomerTableSkeleton rows={6} />
        ) : failed ? (
          <CustomersLoadError onRetry={reload} />
        ) : !hasCustomers ? (
          <NoCustomersYet available={available} />
        ) : showEmptyResults ? (
          <NoCustomerResults onReset={onReset} />
        ) : (
          <>
            <CustomersTable {...tableProps} />
            <CustomerCardList {...tableProps} />
            <Pagination
              page={page}
              onPage={(value) => write({ [PARAM.page]: value === 1 ? null : String(value) }, true)}
              pageSize={filters.pageSize}
              onPageSize={(size) => write({ [PARAM.pageSize]: size === 25 ? null : String(size) })}
              rangeKey="admin.customers.paginationRange"
              navLabelKey="admin.customers.paginationLabel"
            />
          </>
        )}

        {canManage && (
          <CustomerBulkBar
            count={selected.size}
            busy={busy}
            onClear={() => setSelected(new Set())}
            onReactivate={async () => {
              if (await changeStatus(selectedCustomers.filter((c) => c.status === "suspended"), "active")) {
                setSelected(new Set());
              }
            }}
            onDisable={() => setDisableTargets(selectedCustomers)}
          />
        )}

        <StatusDialog
          customer={statusTarget}
          busy={busy}
          onClose={() => setStatusTarget(null)}
          onConfirm={async (status) => {
            if (!statusTarget) return;
            if (await changeStatus([statusTarget], status)) setStatusTarget(null);
          }}
        />

        <DisableDialog
          customers={disableTargets}
          busy={busy}
          onClose={() => setDisableTargets([])}
          onConfirm={async () => {
            // The accounts this actually changes, not the whole selection: with
            // two already-suspended rows ticked alongside one active, the count
            // is 1 — and naming another account on the confirmation of a
            // consequential action would be wrong.
            const affected = disableTargets.filter((c) => c.status === "active");
            if (await changeStatus(affected, "suspended")) {
              setDisableTargets([]);
              setSelected(new Set());
            }
          }}
        />
      </div>
    </>
  );
}
