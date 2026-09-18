import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, UserPlus } from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { CustomerMetricsRow } from "../../components/admin/CustomerMetricsRow";
import { CustomersToolbar } from "../../components/admin/CustomersToolbar";
import { CustomerCardList, CustomersTable } from "../../components/admin/CustomersTable";
import { CustomerBulkBar } from "../../components/admin/CustomerBulkBar";
import { Pagination } from "../../components/admin/Pagination";
import {
  CustomerTableSkeleton,
  NoCustomerResults,
  NoCustomersYet,
} from "../../components/admin/CustomersPlaceholders";
import {
  AddCustomerDialog,
  DisableDialog,
  EmailDialog,
  ExportDialog,
  StatusDialog,
  type ExportFormat,
  type ExportScope,
} from "../../components/admin/CustomerDialogs";
import { useAdminCustomers } from "../../lib/adminCustomers";
import { useAdminOrders } from "../../lib/adminOrders";
import { useToast } from "../../lib/toast";
import {
  activeFilterCount,
  applyFilters,
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
} from "../../data/adminCustomers";
import { useAdminShell } from "./AdminLayout";

/**
 * Customers — the second workspace of the back office.
 *
 * The page answers five questions without being learned first: how large the
 * base is, how much of it is active, who signed up recently, who is studying,
 * and where Clara Vidal is. The reading order is fixed and matches Orders, so
 * an administrator who has learned one screen has learned this one: the header
 * says where you are, the KPI row answers the counting questions *and* filters,
 * the toolbar answers the finding question, and everything below is the table.
 *
 * State lives in three places, on purpose, exactly as it does on Orders:
 *
 * - **The URL** holds what the table is showing (`lib/adminCustomerFilters`),
 *   so a filtered view is a shareable link and the back button works.
 * - **`useAdminCustomers`** holds the base, so suspending an account moves the
 *   badge, the "Active" tile and that account's own history at once rather than
 *   just raising a toast.
 * - **This component** holds only what is genuinely transient: which rows are
 *   ticked, which dialog is open, and the short pending flash that stands in
 *   for a request.
 *
 * The workspace shell — the rail and the sticky `AdminHeader` — comes from
 * `AdminLayout`, so this file owns the workspace and nothing about the chrome
 * around it.
 */

/** How long the simulated refetch shows skeleton rows. */
const FILTER_DELAY = 420;

export function Customers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const { customers, setStatus, setStatusMany } = useAdminCustomers();
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
        // out: `?statut=&formation=all` is a link nobody can read, and it makes
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

  const overview = useMemo(() => metrics(customers), [customers]);
  const filtered = useMemo(() => applyFilters(customers, filters), [customers, filters]);
  const page = useMemo(
    () => paginate(filtered, filters.page, filters.pageSize),
    [filtered, filters.page, filters.pageSize],
  );
  const availableTags = useMemo(() => tagsInUse(customers), [customers]);

  /**
   * Last order per customer, computed once for the whole page rather than per
   * row: `lastOrderAt` filters the order book, and doing that inside twenty-five
   * rows is twenty-five passes over forty-six orders on every keystroke.
   */
  const lastOrders = useMemo(() => {
    const map = new Map<string, string>();
    page.items.forEach((customer) => {
      const at = lastOrderAt(customer, orders);
      if (at) map.set(customer.id, at);
    });
    return map;
  }, [page.items, orders]);

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
   * invocation in development, which makes the page open into skeletons with no
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
  /* Dialogs and feedback                                                   */
  /* ---------------------------------------------------------------------- */

  const [statusTarget, setStatusTarget] = useState<AdminCustomerRecord | null>(null);
  const [disableTargets, setDisableTargets] = useState<AdminCustomerRecord[]>([]);
  const [emailTargets, setEmailTargets] = useState<AdminCustomerRecord[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  /** Detail path carrying the list's current query, so "back" returns here. */
  const hrefFor = (customer: AdminCustomerRecord) =>
    `/admin/clients/${customer.id}${querySignature ? `?${querySignature}` : ""}`;

  /** The detail page, opened straight onto one of its tabs. */
  const hrefForTab = (customer: AdminCustomerRecord, tab: string) => {
    const next = new URLSearchParams(params);
    next.set("onglet", tab);
    return `/admin/clients/${customer.id}?${next.toString()}`;
  };

  const applyStatusToSelection = (status: CustomerStatus) => {
    const ids = [...selected];
    setStatusMany(ids, status);
    setSelected(new Set());
    showToast(
      t("admin.customers.toastBulkStatusTitle", { count: ids.length }),
      t("admin.customers.toastBulkStatusBody", { status: t(`admin.customers.status.${status}`) }),
    );
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
    onEmail: (customer: AdminCustomerRecord) => setEmailTargets([customer]),
    onToggleAccount: (customer: AdminCustomerRecord) => {
      // Reactivating is not destructive, so it does not need a confirmation —
      // it opens the status dialog, where the operator sees the three states
      // and what each one means. Suspending goes straight to the confirmation.
      if (customer.status === "suspended") setStatusTarget(customer);
      else setDisableTargets([customer]);
    },
    lastOrders,
    hrefFor,
  };

  const hasCustomers = customers.length > 0;
  const showEmptyResults = !pending && hasCustomers && filtered.length === 0;

  return (
    <>
      {/* The workspace's own header, so Customers starts at the same vertical
          position as Orders and the Dashboard. One action only: the header's
          action slot is `flex-none`, and a second button there overflows a
          375px screen — so Export lives in the panel below, beside the table it
          would act on. */}
      <AdminHeader
        title={t("admin.customers.title")}
        description={t("admin.customers.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.customers") }]}
        onOpenNav={openNav}
        actions={
          <AdminButton variant="primary" iconLeft={UserPlus} onClick={() => setAddOpen(true)}>
            {t("admin.customers.addCustomer")}
          </AdminButton>
        }
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

          {/* Export sits with the table rather than in the header: it acts on
              what the toolbar above has narrowed to, and the dialog's scope
              options only make sense next to the result count. */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
            <AdminButton variant="outline" iconLeft={Download} onClick={() => setExportOpen(true)}>
              {t("admin.customers.exportCustomers")}
            </AdminButton>
          </div>
        </div>

        {!hasCustomers ? (
          <NoCustomersYet onAdd={() => setAddOpen(true)} />
        ) : pending ? (
          <CustomerTableSkeleton rows={Math.min(8, Math.max(3, page.items.length || 6))} />
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

        <CustomerBulkBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          onExport={() => setExportOpen(true)}
          onEmail={() => setEmailTargets(selectedCustomers)}
          onStatus={applyStatusToSelection}
          onDisable={() => setDisableTargets(selectedCustomers)}
        />

        <StatusDialog
          customer={statusTarget}
          onClose={() => setStatusTarget(null)}
          onConfirm={(status) => {
            if (!statusTarget) return;
            setStatus(statusTarget.id, status);
            showToast(
              t("admin.customers.toastStatusTitle", { name: customerName(statusTarget) }),
              t("admin.customers.toastStatusBody", { status: t(`admin.customers.status.${status}`) }),
              status === "suspended" ? "warning" : "success",
            );
            setStatusTarget(null);
          }}
        />

        <DisableDialog
          customers={disableTargets}
          onClose={() => setDisableTargets([])}
          onConfirm={() => {
            // The accounts this actually changes, not the whole selection: with
            // two already-suspended rows ticked alongside one active, the count
            // is 1 — and naming `disableTargets[0]` would put an untouched
            // account's name on the confirmation of a consequential action.
            const affected = disableTargets.filter((c) => c.status !== "suspended");
            setStatusMany(affected.map((c) => c.id), "suspended");
            showToast(
              affected.length === 1
                ? t("admin.customers.toastDisableTitle", { name: customerName(affected[0]) })
                : t("admin.customers.toastDisableTitleMany", { count: affected.length }),
              t("admin.customers.toastDisableBody"),
              "warning",
            );
            setDisableTargets([]);
            setSelected(new Set());
          }}
        />

        <EmailDialog
          customers={emailTargets}
          onClose={() => setEmailTargets([])}
          onConfirm={(subject, recipients) => {
            setEmailTargets([]);
            showToast(
              t("admin.customers.toastEmailTitle", { count: recipients }),
              t("admin.customers.toastEmailBody", { subject }),
              "info",
            );
          }}
        />

        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          selectionCount={selected.size}
          filteredCount={filtered.length}
          totalCount={customers.length}
          onConfirm={(scope: ExportScope, format: ExportFormat) => {
            const count =
              scope === "selection" ? selected.size : scope === "filtered" ? filtered.length : customers.length;
            setExportOpen(false);
            showToast(
              t("admin.customers.toastExportTitle"),
              t("admin.customers.toastExportBody", {
                count,
                format: t(`admin.customers.exportFormats.${format}`),
              }),
              "info",
            );
          }}
        />

        <AddCustomerDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onConfirm={(email) => {
            setAddOpen(false);
            showToast(t("admin.customers.toastInviteTitle"), t("admin.customers.toastInviteBody", { email }), "info");
          }}
        />
      </div>
    </>
  );
}
