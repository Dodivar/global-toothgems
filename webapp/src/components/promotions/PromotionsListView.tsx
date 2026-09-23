import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Archive, CalendarRange, FolderMinus, FolderPlus, Plus, SearchX, Sparkles, TicketPercent } from "lucide-react";
import { AdminButton } from "../admin/AdminButton";
import { AdminSelect } from "../admin/AdminSelect";
import { ConfirmationDialog } from "../admin/ConfirmationDialog";
import { Pagination } from "../admin/Pagination";
import { usePromotions } from "../../lib/adminPromotions";
import { useToast } from "../../lib/toast";
import { paginate } from "../../lib/adminOrderFilters";
import {
  filterPromotions,
  type PromotionFilters,
  type PromotionTab,
} from "../../lib/promotionRules";
import { campaignStatus, PROMOTION_STATUSES, PROMOTION_TYPES, type Promotion, type PromotionLifecycle, type PromotionStatus, type PromotionType } from "../../data/adminPromotions";
import { PromotionBulkBar } from "./PromotionBulkBar";
import { PromotionCardList, PromotionsSkeleton, PromotionsTable } from "./PromotionsTable";
import { PromotionsToolbar } from "./PromotionsToolbar";
import { PromoEmpty } from "./PromoEmpty";
import { ErrorPanel, FormDialog, Panel } from "./PromoUi";
import { PromotionCalendar } from "./Timeline";
import { useProductsByCategory } from "./ProductPicker";

/**
 * The promotion list behind the All / Active / Scheduled / Expired tabs.
 *
 * Filters live in the URL, like every list in this admin: a filtered view is a
 * link, "back" restores it, and switching tab keeps the search. The selection
 * and the open dialog are the only local state.
 */

const P = { q: "q", statuses: "statut", type: "type", campaign: "campagne", product: "produit", from: "du", to: "au", sort: "tri", page: "page", size: "taille" };

function readFilters(params: URLSearchParams): PromotionFilters {
  const statuses = (params.get(P.statuses) ?? "").split(",").filter((s): s is PromotionStatus => (PROMOTION_STATUSES as string[]).includes(s));
  const type = params.get(P.type);
  return {
    query: params.get(P.q) ?? "",
    statuses,
    type: type && (PROMOTION_TYPES as string[]).includes(type) ? (type as PromotionType) : "all",
    campaign: params.get(P.campaign) ?? "all",
    product: params.get(P.product) ?? "all",
    from: params.get(P.from) ?? "",
    to: params.get(P.to) ?? "",
    sort: (["newest", "performance", "expiration", "name"].includes(params.get(P.sort) ?? "") ? params.get(P.sort) : "newest") as PromotionFilters["sort"],
  };
}

export function PromotionsListView({ tab }: { tab: PromotionTab }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const store = usePromotions();
  const { promotions, campaigns, loading, demoMode, setDemoMode, campaignName } = store;
  const byCategory = useProductsByCategory();

  const filters = useMemo(() => readFilters(params), [params]);
  const page = Math.max(1, Number(params.get(P.page) ?? 1) || 1);
  const pageSize = Number(params.get(P.size) ?? 10) || 10;

  const write = useCallback(
    (patch: Partial<PromotionFilters>) => {
      const next = new URLSearchParams(params);
      const set = (key: string, value: string | null) => (value ? next.set(key, value) : next.delete(key));
      if ("query" in patch) set(P.q, patch.query || null);
      if ("statuses" in patch) set(P.statuses, patch.statuses?.length ? patch.statuses.join(",") : null);
      if ("type" in patch) set(P.type, patch.type === "all" ? null : patch.type!);
      if ("campaign" in patch) set(P.campaign, patch.campaign === "all" ? null : patch.campaign!);
      if ("product" in patch) set(P.product, patch.product === "all" ? null : patch.product!);
      if ("from" in patch) set(P.from, patch.from || null);
      if ("to" in patch) set(P.to, patch.to || null);
      if ("sort" in patch) set(P.sort, patch.sort === "newest" ? null : patch.sort!);
      next.delete(P.page);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const reset = () => {
    const next = new URLSearchParams();
    const view = params.get("vue");
    if (view) next.set("vue", view);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(
    () => filterPromotions(promotions, filters, tab, (id) => campaignName(id), byCategory),
    [promotions, filters, tab, campaignName, byCategory],
  );
  const paged = useMemo(() => paginate(filtered, page, pageSize), [filtered, page, pageSize]);

  /* Selection -------------------------------------------------------------- */

  const [rawSelected, setSelected] = useState<Set<string>>(new Set());
  // A ticked row that a filter hides is dropped from the selection, so a bulk
  // action never touches rows that are no longer on screen. Derived during
  // render rather than synced in an effect.
  const selected = useMemo(() => {
    const visible = new Set(filtered.map((p) => p.id));
    return new Set([...rawSelected].filter((id) => visible.has(id)));
  }, [rawSelected, filtered]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const ids = paged.items.map((p) => p.id);
      const allOn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });

  /* Actions ---------------------------------------------------------------- */

  const [pending, setPending] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [archiveTargets, setArchiveTargets] = useState<Promotion[]>([]);
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [campaignChoice, setCampaignChoice] = useState("");
  const [removeDialog, setRemoveDialog] = useState(false);

  const onLifecycle = async (p: Promotion, lifecycle: PromotionLifecycle) => {
    setPending((prev) => new Set(prev).add(p.id));
    await store.setPromotionLifecycle([p.id], lifecycle);
    setPending((prev) => {
      const next = new Set(prev);
      next.delete(p.id);
      return next;
    });
    showToast(
      t(`promo.toast.lifecycle.${lifecycle}`, { name: p.name }),
      lifecycle === "paused" ? t("promo.toast.pausedBody") : lifecycle === "live" ? t("promo.toast.liveBody") : undefined,
      lifecycle === "paused" ? "warning" : "success",
    );
  };

  const onDuplicate = async (ids: string[]) => {
    setBusy(true);
    const copies = await store.duplicatePromotions(ids);
    setBusy(false);
    setSelected(new Set());
    showToast(t("promo.toast.duplicated", { count: copies.length }), t("promo.toast.duplicatedBody"));
    if (copies.length === 1) navigate(`/admin/promotions/${copies[0].id}/modifier`);
  };

  const bulkLifecycle = async (lifecycle: PromotionLifecycle) => {
    const ids = [...selected];
    setBusy(true);
    await store.setPromotionLifecycle(ids, lifecycle);
    setBusy(false);
    setSelected(new Set());
    showToast(t(`promo.toast.bulk.${lifecycle}`, { count: ids.length }), undefined, lifecycle === "paused" ? "warning" : "success");
  };

  const confirmArchive = async () => {
    setBusy(true);
    await store.setPromotionLifecycle(archiveTargets.map((p) => p.id), "archived");
    setBusy(false);
    showToast(t("promo.toast.archived", { count: archiveTargets.length }), t("promo.toast.archivedBody"), "info");
    setArchiveTargets([]);
    setSelected(new Set());
  };

  const confirmAssign = async () => {
    setBusy(true);
    const ids = [...selected];
    await store.assignCampaign(ids, campaignChoice);
    setBusy(false);
    setCampaignDialog(false);
    setSelected(new Set());
    showToast(t("promo.toast.assigned", { count: ids.length, name: campaignName(campaignChoice) }));
  };

  const confirmRemove = async () => {
    setBusy(true);
    const ids = [...selected];
    await store.assignCampaign(ids, null);
    setBusy(false);
    setRemoveDialog(false);
    setSelected(new Set());
    showToast(t("promo.toast.unassigned", { count: ids.length }), undefined, "info");
  };

  const selectedList = promotions.filter((p) => selected.has(p.id));
  const assignable = campaigns.filter((c) => campaignStatus(c) !== "archived" && campaignStatus(c) !== "completed");

  /* Render ----------------------------------------------------------------- */

  const listProps = {
    promotions: paged.items,
    selected,
    pending,
    onToggle: toggle,
    onToggleAll: toggleAll,
    sort: filters.sort,
    onSort: (sort: PromotionFilters["sort"]) => write({ sort }),
    campaignName,
    onLifecycle,
    onDuplicate: (p: Promotion) => onDuplicate([p.id]),
    onArchive: (p: Promotion) => setArchiveTargets([p]),
  };

  if (demoMode === "error") {
    return (
      <ErrorPanel
        title={t("promo.error.title")}
        body={t("promo.error.body")}
        retryLabel={t("promo.error.retry")}
        onRetry={() => setDemoMode("live")}
      />
    );
  }

  if (!loading && promotions.length === 0) {
    return (
      <div className="gt-admin-panel">
        <PromoEmpty
          icon={TicketPercent}
          tone="highlight"
          title={t("promo.empty.noPromotions.title")}
          body={t("promo.empty.noPromotions.body")}
          actions={
            <>
              <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/promotions/nouvelle")}>
                {t("promo.header.createPromotion")}
              </AdminButton>
              <AdminButton variant="outline" iconLeft={Sparkles} onClick={() => setDemoMode("live")}>
                {t("promo.empty.loadExamples")}
              </AdminButton>
            </>
          }
        >
          <ul className="m-0 mt-4 grid max-w-[640px] list-none gap-2 p-0 text-left sm:grid-cols-3">
            {(["percentage", "freeShipping", "bxgy"] as PromotionType[]).map((type) => (
              <li key={type} className="rounded-[var(--admin-radius)] border border-dashed border-[var(--border-default)] p-3">
                <p className="m-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t(`promo.type.${type}`)}</p>
                <p className="m-0 text-[11px] text-[var(--text-muted)]">{t(`promo.typeHint.${type}`)}</p>
              </li>
            ))}
          </ul>
        </PromoEmpty>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {tab === "all" && !loading && (
        <Panel title={t("promo.calendar.title")} icon={CalendarRange}>
          <PromotionCalendar promotions={promotions} campaignName={campaignName} />
        </Panel>
      )}

      <div className="gt-admin-panel p-4">
        <PromotionsToolbar
          filters={filters}
          campaigns={campaigns}
          showStatus={tab === "all"}
          resultCount={filtered.length}
          onChange={write}
          onReset={reset}
        />
      </div>

      {loading ? (
        <PromotionsSkeleton label={t("promo.common.loading")} />
      ) : filtered.length === 0 ? (
        <div className="gt-admin-panel">
          <PromoEmpty
            icon={SearchX}
            tone="neutral"
            compact
            title={filters.query ? t("promo.empty.noResults.titleQuery", { query: filters.query }) : t(`promo.empty.tab.${tab}.title`)}
            body={filters.query || filters.statuses.length || filters.type !== "all" ? t("promo.empty.noResults.body") : t(`promo.empty.tab.${tab}.body`)}
            actions={
              <>
                <AdminButton variant="outline" onClick={reset}>
                  {t("promo.filters.resetShort")}
                </AdminButton>
                <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/promotions/nouvelle")}>
                  {t("promo.header.createPromotion")}
                </AdminButton>
              </>
            }
          />
        </div>
      ) : (
        <>
          <PromotionsTable {...listProps} />
          <PromotionCardList {...listProps} />
          <Pagination
            page={paged}
            onPage={(value) => {
              const next = new URLSearchParams(params);
              if (value === 1) next.delete(P.page);
              else next.set(P.page, String(value));
              setParams(next, { replace: true });
            }}
            pageSize={pageSize}
            onPageSize={(size) => {
              const next = new URLSearchParams(params);
              next.set(P.size, String(size));
              next.delete(P.page);
              setParams(next, { replace: true });
            }}
            rangeKey="promo.pagination.range"
            navLabelKey="promo.pagination.label"
          />
        </>
      )}

      {/* Room for the floating bulk bar so it never covers the last row. */}
      {selected.size > 0 && <div aria-hidden="true" className="h-16" />}

      <PromotionBulkBar
        count={selected.size}
        busy={busy}
        onActivate={() => bulkLifecycle("live")}
        onPause={() => bulkLifecycle("paused")}
        onDuplicate={() => onDuplicate([...selected])}
        onAddToCampaign={() => {
          setCampaignChoice(assignable[0]?.id ?? "");
          setCampaignDialog(true);
        }}
        onRemoveFromCampaign={() => setRemoveDialog(true)}
        onArchive={() => setArchiveTargets(selectedList)}
        onClear={() => setSelected(new Set())}
      />

      <ConfirmationDialog
        open={archiveTargets.length > 0}
        icon={Archive}
        title={
          archiveTargets.length === 1
            ? t("promo.dialogs.archiveOne.title", { name: archiveTargets[0]?.name })
            : t("promo.dialogs.archiveMany.title", { count: archiveTargets.length })
        }
        body={
          <>
            <p className="m-0">{t("promo.dialogs.archiveOne.body")}</p>
            {archiveTargets.some((p) => p.stats.uses > 0) && (
              <p className="m-0 mt-2 font-semibold">{t("promo.dialogs.archiveOne.reporting")}</p>
            )}
          </>
        }
        confirmLabel={t("promo.dialogs.archiveOne.confirm")}
        cancelLabel={t("promo.common.cancel")}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTargets([])}
        loading={busy}
        tone="danger"
      />

      <FormDialog
        open={campaignDialog}
        icon={FolderPlus}
        title={t("promo.dialogs.assign.title", { count: selected.size })}
        description={t("promo.dialogs.assign.body")}
        confirmLabel={t("promo.dialogs.assign.confirm")}
        cancelLabel={t("promo.common.cancel")}
        onConfirm={confirmAssign}
        onClose={() => setCampaignDialog(false)}
        confirmDisabled={!campaignChoice}
        loading={busy}
      >
        {assignable.length > 0 ? (
          <label className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
            <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">{t("promo.dialogs.assign.field")}</span>
            <AdminSelect value={campaignChoice} onChange={(e) => setCampaignChoice(e.target.value)} options={assignable.map((c) => ({ value: c.id, label: c.name }))} />
          </label>
        ) : (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("promo.dialogs.assign.none")}</p>
        )}
      </FormDialog>

      <FormDialog
        open={removeDialog}
        icon={FolderMinus}
        title={t("promo.dialogs.unassign.title", { count: selected.size })}
        description={t("promo.dialogs.unassign.body")}
        confirmLabel={t("promo.dialogs.unassign.confirm")}
        cancelLabel={t("promo.common.cancel")}
        onConfirm={confirmRemove}
        onClose={() => setRemoveDialog(false)}
        loading={busy}
      />
    </div>
  );
}
