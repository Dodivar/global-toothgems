"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "../../lib/navigation";
import {
  ArrowLeft,
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  FileText,
  GraduationCap,
  LayoutGrid,
  Mail,
  MoreHorizontal,
  Pencil,
  ShoppingBag,
  Sparkles,
  UserRoundX,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { Button } from "../../components/ui/Button";
import { Menu, type MenuItem } from "../../components/ui/Menu";
import { Avatar } from "../../components/admin/CustomerCells";
import { CustomerStatusBadge, SegmentBadge } from "../../components/admin/CustomerBadges";
import { CustomerTags } from "../../components/admin/CustomerTags";
import { CustomerNotes } from "../../components/admin/CustomerNotes";
import { CustomerEditForm } from "../../components/admin/CustomerEditForm";
import { CustomerTableSkeleton, CustomersLoadError } from "../../components/admin/CustomersPlaceholders";
import {
  ActivityPanel,
  CustomerSummary,
  OrdersPanel,
  OverviewPanel,
  TrainingPanel,
} from "../../components/admin/CustomerPanels";
import { DisableDialog, StatusDialog } from "../../components/admin/CustomerDialogs";
import {
  useAdminCustomers,
  type CustomerProfileDraft,
  type CustomerWriteError,
  type CustomerWriteResult,
} from "../../lib/adminCustomers";
import { useAdminOrders } from "../../lib/adminOrders";
import { useToast } from "../../lib/toast";
import { useFormat } from "../../lib/format";
import {
  customerActivity,
  customerName,
  customerOrders,
  customerSegment,
  customerShortId,
  lastOrderAt,
  type AdminCustomerRecord,
  type CustomerTag,
  type StaffSettableStatus,
  type StatusChange,
} from "../../data/adminCustomers";
import type { AdminOrder } from "../../data/adminOrders";
import { useAdminShell } from "./AdminLayout";

/**
 * One customer, in full.
 *
 * A route rather than a drawer: a customer is the thing a colleague pastes into
 * a message, and a drawer has no address; and the record is too tall to read in
 * a panel. The list's own query string travels in the URL, so the breadcrumb,
 * the back link and the previous/next arrows all return to the same filtered
 * page of the same table. The active tab is in the URL too (`?onglet=`).
 *
 * Everything shown is read from Supabase through `useAdminCustomers`; the
 * status changes come from the audit trail (`admin_customer_status_history()`),
 * read again whenever the status moves. Editing, tags, status and notes need
 * `manage_customers`: read-only staff get the same page without those controls
 * (and without the edit tab).
 */

/** Tabs, in the order they are read. URL values are French like every route. */
const TABS = ["apercu", "commandes", "formation", "activite", "notes", "edition"] as const;
type Tab = (typeof TABS)[number];

const TAB_META: Record<Tab, { labelKey: string; icon: typeof LayoutGrid }> = {
  apercu: { labelKey: "admin.customers.tabOverview", icon: LayoutGrid },
  commandes: { labelKey: "admin.customers.tabOrders", icon: ShoppingBag },
  formation: { labelKey: "admin.customers.tabTraining", icon: GraduationCap },
  activite: { labelKey: "admin.customers.tabActivity", icon: Sparkles },
  notes: { labelKey: "admin.customers.tabNotes", icon: FileText },
  edition: { labelKey: "admin.customers.tabEdit", icon: Pencil },
};

export function CustomerDetail() {
  const { formatDateShort } = useFormat();
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [params, setParams] = useSearchParams();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const {
    customers,
    loading,
    failed,
    reload,
    canManage,
    currentUserId,
    operatorName,
    setStatus,
    addTag,
    removeTag,
    addNote,
    editNote,
    deleteNote,
    saveProfile,
    readStatusHistory,
  } = useAdminCustomers();
  const { orders } = useAdminOrders();

  const customer = customers.find((c) => c.id === id);

  /* ---------------------------------------------------------------------- */
  /* Tab                                                                    */
  /* ---------------------------------------------------------------------- */

  const tabs: readonly Tab[] = canManage ? TABS : TABS.filter((tab) => tab !== "edition");
  const rawTab = params.get("onglet");
  const tab: Tab = tabs.includes(rawTab as Tab) ? (rawTab as Tab) : "apercu";

  const setTab = useCallback(
    (next: Tab) => {
      const query = new URLSearchParams(params);
      // The default tab is absent from the URL rather than spelled out, the same
      // rule the list's filters follow.
      if (next === "apercu") query.delete("onglet");
      else query.set("onglet", next);
      setParams(query, { replace: true });
    },
    [params, setParams],
  );

  /** The list's query, without this page's own tab parameter. */
  const listQuery = useMemo(() => {
    const query = new URLSearchParams(params);
    query.delete("onglet");
    const string = query.toString();
    return string ? `?${string}` : "";
  }, [params]);

  const backTo = `/admin/clients${listQuery}`;

  /* ---------------------------------------------------------------------- */
  /* Neighbours                                                             */
  /* ---------------------------------------------------------------------- */

  /** Neighbours in the base, so an operator can work through a list in place. */
  const { previous, next } = useMemo(() => {
    const index = customers.findIndex((c) => c.id === id);
    return {
      previous: index > 0 ? customers[index - 1] : undefined,
      next: index >= 0 && index < customers.length - 1 ? customers[index + 1] : undefined,
    };
  }, [customers, id]);

  /* ---------------------------------------------------------------------- */
  /* Status history                                                         */
  /* ---------------------------------------------------------------------- */

  const [history, setHistory] = useState<StatusChange[]>([]);
  const currentStatus = customer?.status;

  // Read again whenever the status moves, so the activity tab shows the change
  // the operator just made, as the audit trail recorded it.
  useEffect(() => {
    if (!currentStatus) return;
    let live = true;
    readStatusHistory(id).then((changes) => {
      if (live) setHistory(changes ?? []);
    });
    return () => {
      live = false;
    };
  }, [id, currentStatus, readStatusHistory]);

  /* ---------------------------------------------------------------------- */
  /* Dialogs and saving                                                     */
  /* ---------------------------------------------------------------------- */

  const [statusOpen, setStatusOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const derived = useMemo(() => {
    if (!customer) return null;
    return {
      orders: customerOrders(customer, orders),
      activity: customerActivity(customer, orders, history),
      lastOrder: lastOrderAt(customer, orders),
    };
  }, [customer, orders, history]);

  const refused = (error: CustomerWriteError) =>
    showToast(t("admin.customers.writeErrorTitle"), t(`admin.customers.writeError.${error}`), "error");

  /** Shows the refusal, if any; true when the write went through. */
  const settle = (result: CustomerWriteResult): boolean => {
    if (!result.ok) refused(result.error);
    return result.ok;
  };

  if (loading) {
    return (
      <>
        <AdminHeader
          title={t("admin.customers.title")}
          crumbs={[
            { label: t("admin.nav.dashboard"), to: "/admin" },
            { label: t("admin.nav.customers"), to: backTo },
          ]}
          onOpenNav={openNav}
        />
        <div className="px-[var(--admin-gutter)] pt-5">
          <CustomerTableSkeleton rows={4} />
        </div>
      </>
    );
  }

  if (failed) {
    return (
      <>
        <AdminHeader
          title={t("admin.customers.title")}
          crumbs={[
            { label: t("admin.nav.dashboard"), to: "/admin" },
            { label: t("admin.nav.customers"), to: backTo },
          ]}
          onOpenNav={openNav}
        />
        <div className="px-[var(--admin-gutter)] pt-5">
          <CustomersLoadError onRetry={reload} />
        </div>
      </>
    );
  }

  if (!customer || !derived) {
    return (
      <>
        <AdminHeader
          title={t("admin.customers.detailMissingTitle")}
          crumbs={[
            { label: t("admin.nav.dashboard"), to: "/admin" },
            { label: t("admin.nav.customers"), to: "/admin/clients" },
          ]}
          onOpenNav={openNav}
        />
        <div className="px-[var(--admin-gutter)] pt-5">
          <section className="grid justify-items-start gap-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] p-[var(--space-8)]">
            <span
              aria-hidden="true"
              className="grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]"
            >
              <UserRoundX size={22} />
            </span>
            <h2 className="text-[length:var(--text-h3)]">{t("admin.customers.detailMissingTitle")}</h2>
            <p className="m-0 max-w-[48ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("admin.customers.detailMissingBody")}
            </p>
            <Button size="sm" variant="outline" iconLeft={ArrowLeft} onClick={() => navigate("/admin/clients")}>
              {t("admin.customers.backToCustomers")}
            </Button>
          </section>
        </div>
      </>
    );
  }

  const suspended = customer.status === "suspended";
  const name = customerName(customer);

  const hrefForOrder = (order: AdminOrder) => `/admin/commandes/${order.reference}`;

  const neighbourLink = (target: AdminCustomerRecord | undefined, direction: "previous" | "next") => {
    if (!target) return null;
    const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
    return (
      <Link
        to={`/admin/clients/${target.id}${search}`}
        aria-label={t(
          direction === "previous" ? "admin.customers.previousCustomer" : "admin.customers.nextCustomer",
          { name: customerName(target) },
        )}
        className="grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
      >
        <Icon size={16} aria-hidden="true" />
      </Link>
    );
  };

  const moreItems: MenuItem[] = [];
  if (canManage && customer.status !== "deactivated") {
    moreItems.push({
      id: "status",
      label: t("admin.customers.actionChangeStatus"),
      icon: CircleCheck,
      onSelect: () => setStatusOpen(true),
    });
  }
  moreItems.push({
    id: "notes",
    label: t(canManage ? "admin.customers.actionAddNote" : "admin.customers.tabNotes"),
    icon: FileText,
    onSelect: () => setTab("notes"),
  });
  if (canManage && customer.status === "active") {
    moreItems.push({
      id: "disable",
      label: t("admin.customers.actionDisable"),
      icon: Ban,
      destructive: true,
      onSelect: () => setDisableOpen(true),
    });
  }

  const changeStatus = async (status: StaffSettableStatus): Promise<boolean> => {
    setSaving(true);
    const result = await setStatus([customer.id], status);
    setSaving(false);
    if (!result.ok) {
      refused(result.error);
      return false;
    }
    if (status === "suspended") {
      showToast(t("admin.customers.toastDisableTitle", { name }), t("admin.customers.toastDisableBody"), "warning");
    } else {
      showToast(
        t("admin.customers.toastStatusTitle", { name }),
        t("admin.customers.toastStatusBody", { status: t(`admin.customers.status.${status}`) }),
      );
    }
    return true;
  };

  const handleSave = async (draft: CustomerProfileDraft) => {
    setSaving(true);
    const result = await saveProfile(customer.id, draft);
    setSaving(false);
    if (!settle(result)) return;
    setTab("apercu");
    showToast(t("admin.customers.toastSavedTitle"), t("admin.customers.toastSavedBody", { name }));
  };

  return (
    <>
      <AdminHeader
        title={name}
        crumbs={[
          { label: t("admin.nav.dashboard"), to: "/admin" },
          { label: t("admin.nav.customers"), to: backTo },
          { label: name },
        ]}
        onOpenNav={openNav}
        actions={
          // The operator's own mail client: the shop sends no message from here.
          <AdminButton
            variant="primary"
            iconLeft={Mail}
            onClick={() => window.location.assign(`mailto:${customer.email}`)}
          >
            {t("admin.customers.actionEmail")}
          </AdminButton>
        }
      />

      <div className="grid gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        {/* Back link and queue navigation. */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {t("admin.customers.backToCustomers")}
          </Link>
          <span className="ml-auto flex items-center gap-1.5">
            {neighbourLink(previous, "previous")}
            {neighbourLink(next, "next")}
          </span>
        </div>

        {/* Profile header: who they are, what state the account is in, and the
            actions worth reaching for without opening a tab. */}
        <div className="gt-admin-panel grid gap-4 p-[var(--space-5)]">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar customer={customer} size={64} />

            <div className="grid min-w-0 flex-1 gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 text-[length:var(--text-h3)] leading-none">{name}</h2>
                <CustomerStatusBadge status={customer.status} size="sm" />
                <SegmentBadge segment={customerSegment(customer)} size="sm" />
              </div>
              <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                <span className="uppercase tracking-[var(--tracking-wide)]" title={customer.id}>
                  {t("admin.customers.idPrefix")}
                  {customerShortId(customer)}
                </span>
                <a href={`mailto:${customer.email}`} className="break-all underline decoration-1 underline-offset-4">
                  {customer.email}
                </a>
                {customer.phone && (
                  <a href={`tel:${customer.phone.replace(/\s/g, "")}`} className="underline decoration-1 underline-offset-4">
                    {customer.phone}
                  </a>
                )}
                <span>{t("admin.customers.registeredOn", { date: formatDateShort(customer.since) })}</span>
              </p>
            </div>

            <div className="flex flex-none flex-wrap items-center gap-2">
              {canManage && (
                <Button size="sm" variant="outline" iconLeft={Pencil} onClick={() => setTab("edition")}>
                  {t("admin.customers.actionEdit")}
                </Button>
              )}
              <Button size="sm" variant="ghost" iconLeft={ShoppingBag} onClick={() => setTab("commandes")}>
                {t("admin.customers.actionViewOrders")}
              </Button>
              <Menu
                label={t("admin.customers.moreActions")}
                items={moreItems}
                trigger={(props) => (
                  <button
                    type="button"
                    {...props}
                    className="grid h-9 w-9 place-items-center rounded-[var(--radius-pill)] border border-[var(--border-default)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <MoreHorizontal size={17} aria-hidden="true" />
                  </button>
                )}
              />
            </div>
          </div>

          {/* A suspended account says so in words at the top of its own record:
              the badge alone is enough to scan a table, not to stop an operator
              from spending five minutes on an account that cannot be used. */}
          {suspended && (
            <p className="m-0 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[var(--gt-red-400)] bg-[var(--status-error-bg)] p-3 text-[length:var(--text-body-sm)] text-[var(--status-error-fg)]">
              <Ban size={15} aria-hidden="true" className="flex-none" />
              <span className="flex-1">{t("admin.customers.suspendedBanner")}</span>
              {canManage && (
                <Button size="sm" variant="ghost" onClick={() => setStatusOpen(true)}>
                  {t("admin.customers.actionChangeStatus")}
                </Button>
              )}
            </p>
          )}

          <div className="border-t border-[var(--border-subtle)] pt-4">
            <CustomerTags
              tags={customer.tags}
              editable={canManage}
              onAdd={async (tag: CustomerTag) => {
                if (!settle(await addTag(customer.id, tag))) return;
                showToast(
                  t("admin.customers.toastTagAddedTitle"),
                  t("admin.customers.toastTagAddedBody", { tag: t(`admin.customers.tag.${tag}`), name }),
                );
              }}
              onRemove={async (tag: CustomerTag) => {
                if (!settle(await removeTag(customer.id, tag))) return;
                showToast(
                  t("admin.customers.toastTagRemovedTitle"),
                  t("admin.customers.toastTagRemovedBody", { tag: t(`admin.customers.tag.${tag}`) }),
                  "info",
                );
              }}
            />
          </div>
        </div>

        <CustomerSummary customer={customer} orders={derived.orders} lastOrder={derived.lastOrder} />

        {/* The tabs. A real tablist: arrow keys move between them. They scroll
            horizontally on a phone rather than wrapping to three lines. */}
        <div className="grid gap-4">
          <div
            role="tablist"
            aria-label={t("admin.customers.tabsLabel")}
            className="gt-admin-scroll -mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const index = tabs.indexOf(tab);
              const nextIndex =
                event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
              setTab(tabs[nextIndex]);
              document.getElementById(`gt-tab-${tabs[nextIndex]}`)?.focus();
            }}
          >
            {tabs.map((value) => {
              const meta = TAB_META[value];
              const Icon = meta.icon;
              const selected = tab === value;
              const count =
                value === "commandes"
                  ? derived.orders.length
                  : value === "formation"
                    ? customer.enrollments.length
                    : value === "notes"
                      ? customer.notes.length
                      : undefined;
              return (
                <button
                  key={value}
                  id={`gt-tab-${value}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={`gt-panel-${value}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(value)}
                  className={clsx(
                    "inline-flex flex-none items-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] border px-4 py-2 text-[length:var(--text-body-sm)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                    selected
                      ? "border-transparent bg-[var(--surface-inverse)] font-semibold text-[var(--text-inverse)]"
                      : "border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-body)] hover:bg-[var(--gt-ink-100)]",
                  )}
                >
                  <Icon size={14} aria-hidden="true" />
                  {t(meta.labelKey)}
                  {count != null && count > 0 && (
                    <span
                      className={clsx(
                        "rounded-[var(--radius-pill)] px-1.5 text-[10px] font-semibold tabular-nums",
                        selected ? "bg-white/20 text-[var(--text-inverse)]" : "bg-[var(--gt-ink-100)] text-[var(--text-muted)]",
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div id={`gt-panel-${tab}`} role="tabpanel" aria-labelledby={`gt-tab-${tab}`} tabIndex={-1}>
            {tab === "apercu" && (
              <OverviewPanel
                customer={customer}
                recent={derived.activity.slice(-3)}
                onEdit={canManage ? () => setTab("edition") : undefined}
                onSeeAllActivity={() => setTab("activite")}
              />
            )}

            {tab === "commandes" && <OrdersPanel orders={derived.orders} hrefForOrder={hrefForOrder} />}

            {tab === "formation" && <TrainingPanel customer={customer} />}

            {tab === "activite" && <ActivityPanel events={derived.activity} />}

            {tab === "notes" && (
              <CustomerNotes
                notes={customer.notes}
                author={operatorName}
                canWrite={canManage}
                currentUserId={currentUserId}
                onAdd={async (body) => {
                  if (!settle(await addNote(customer.id, body))) return false;
                  showToast(t("admin.customers.toastNoteAddedTitle"), t("admin.customers.toastNoteAddedBody"));
                  return true;
                }}
                onEdit={async (noteId, body) => {
                  if (!settle(await editNote(noteId, body))) return false;
                  showToast(t("admin.customers.toastNoteEditedTitle"), t("admin.customers.toastNoteEditedBody"));
                  return true;
                }}
                onDelete={async (noteId) => {
                  if (!settle(await deleteNote(noteId))) return false;
                  showToast(
                    t("admin.customers.toastNoteDeletedTitle"),
                    t("admin.customers.toastNoteDeletedBody"),
                    "info",
                  );
                  return true;
                }}
              />
            )}

            {tab === "edition" && canManage && (
              <CustomerEditForm
                key={customer.id}
                customer={customer}
                saving={saving}
                onCancel={() => setTab("apercu")}
                onSave={handleSave}
              />
            )}
          </div>
        </div>

        <StatusDialog
          customer={statusOpen ? customer : null}
          busy={saving}
          onClose={() => setStatusOpen(false)}
          onConfirm={async (status) => {
            if (await changeStatus(status)) setStatusOpen(false);
          }}
        />

        <DisableDialog
          customers={disableOpen ? [customer] : []}
          busy={saving}
          onClose={() => setDisableOpen(false)}
          onConfirm={async () => {
            if (await changeStatus("suspended")) setDisableOpen(false);
          }}
        />
      </div>
    </>
  );
}
