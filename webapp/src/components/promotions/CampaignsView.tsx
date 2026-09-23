import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Megaphone, Plus, SearchX } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminSelect } from "../admin/AdminSelect";
import { SearchInput } from "../admin/SearchInput";
import { ConfirmationDialog } from "../admin/ConfirmationDialog";
import { usePromotions } from "../../lib/adminPromotions";
import { useToast } from "../../lib/toast";
import { campaignRollup } from "../../lib/promotionRules";
import { CAMPAIGN_STATUSES, campaignStatus, toTime, type Campaign, type CampaignLifecycle, type CampaignStatus } from "../../data/adminPromotions";
import { CampaignCard } from "./CampaignCard";
import { PromoEmpty } from "./PromoEmpty";
import { ErrorPanel } from "./PromoUi";

const ORDER: Record<CampaignStatus, number> = { active: 0, scheduled: 1, paused: 2, draft: 3, completed: 4, archived: 5 };

/**
 * Campaigns as a gallery: running first, then what is coming, then history.
 * A campaign is a visual object — it has a banner customers will see — so the
 * list shows that banner instead of a row of text.
 */
export function CampaignsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const store = usePromotions();
  const { campaigns, promotions, loading, demoMode, setDemoMode } = store;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CampaignStatus | "all">("all");
  const [archiveTarget, setArchiveTarget] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns
      .filter((c) => (status === "all" ? campaignStatus(c) !== "archived" : campaignStatus(c) === status))
      .filter((c) => !q || [c.name, c.title.fr, c.title.en].join(" ").toLowerCase().includes(q))
      .sort((a, b) => ORDER[campaignStatus(a)] - ORDER[campaignStatus(b)] || toTime(a.startsAt) - toTime(b.startsAt));
  }, [campaigns, query, status]);

  const onLifecycle = async (c: Campaign, lifecycle: CampaignLifecycle) => {
    if (lifecycle === "archived") {
      setArchiveTarget(c);
      return;
    }
    await store.setCampaignLifecycle(c.id, lifecycle);
    showToast(t(`promo.toast.campaign.${lifecycle}`, { name: c.name }), undefined, lifecycle === "paused" ? "warning" : "success");
  };

  const onDuplicate = async (c: Campaign) => {
    const copy = await store.duplicateCampaign(c.id);
    if (copy) {
      showToast(t("promo.toast.campaignDuplicated", { name: c.name }), t("promo.toast.campaignDuplicatedBody"));
      navigate(`/admin/promotions/campagnes/${copy.id}/modifier`);
    }
  };

  if (demoMode === "error")
    return <ErrorPanel title={t("promo.error.title")} body={t("promo.error.body")} retryLabel={t("promo.error.retry")} onRetry={() => setDemoMode("live")} />;

  if (!loading && campaigns.length === 0) {
    return (
      <div className="gt-admin-panel">
        <PromoEmpty
          icon={Megaphone}
          title={t("promo.empty.noCampaigns.title")}
          body={t("promo.empty.noCampaigns.body")}
          actions={
            <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/promotions/campagnes/nouvelle")}>
              {t("promo.header.createCampaign")}
            </AdminButton>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="gt-admin-panel flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-[200px] flex-1">
          <SearchInput
            id="campaign-search"
            value={query}
            onChange={setQuery}
            label={t("promo.campaigns.search")}
            placeholder={t("promo.campaigns.search")}
            clearLabel={t("promo.filters.clearSearch")}
          />
        </div>
        <label className="grid w-full gap-1 sm:w-[220px]">
          <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("promo.filters.status")}</span>
          <AdminSelect
            value={status}
            onChange={(e) => setStatus(e.target.value as CampaignStatus | "all")}
            options={[{ value: "all", label: t("promo.campaigns.allCurrent") }, ...CAMPAIGN_STATUSES.map((s) => ({ value: s, label: t(`promo.campaignStatus.${s}`) }))]}
          />
        </label>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label={t("promo.common.loading")}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="gt-admin-panel overflow-hidden">
              <div className="gt-skeleton h-[112px]" />
              <div className="grid gap-2 p-4">
                <div className="gt-skeleton h-3 w-1/2 rounded-full" />
                <div className="gt-skeleton h-2.5 w-1/3 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="gt-admin-panel">
          <PromoEmpty
            icon={SearchX}
            tone="neutral"
            compact
            title={t("promo.empty.noCampaignResults.title")}
            body={t("promo.empty.noCampaignResults.body")}
            actions={
              <AdminButton
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                {t("promo.filters.resetShort")}
              </AdminButton>
            }
          />
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <li key={c.id}>
              <CampaignCard campaign={c} rollup={campaignRollup(c, promotions)} onLifecycle={onLifecycle} onDuplicate={onDuplicate} />
            </li>
          ))}
          <li>
            <Link
              to="/admin/promotions/campagnes/nouvelle"
              className={clsx(
                "grid h-full min-h-[260px] place-items-center content-center gap-2 rounded-[var(--admin-radius)] border-2 border-dashed border-[var(--border-default)] p-6 text-center text-[var(--text-muted)] transition-colors",
                "hover:border-[var(--gt-blue-400)] hover:bg-[var(--gt-blue-50)] hover:text-[var(--gt-blue-700)]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
              )}
            >
              <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                <Plus size={20} />
              </span>
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{t("promo.header.createCampaign")}</span>
              <span className="max-w-[28ch] text-[length:var(--text-caption)]">{t("promo.campaigns.newHint")}</span>
            </Link>
          </li>
        </ul>
      )}

      <ConfirmationDialog
        open={!!archiveTarget}
        title={t("promo.dialogs.archiveCampaign.title", { name: archiveTarget?.name })}
        body={t("promo.dialogs.archiveCampaign.body")}
        confirmLabel={t("promo.dialogs.archiveCampaign.confirm")}
        cancelLabel={t("promo.common.cancel")}
        tone="danger"
        loading={busy}
        onCancel={() => setArchiveTarget(null)}
        onConfirm={async () => {
          if (!archiveTarget) return;
          setBusy(true);
          await store.setCampaignLifecycle(archiveTarget.id, "archived");
          setBusy(false);
          showToast(t("promo.toast.campaign.archived", { name: archiveTarget.name }), undefined, "info");
          setArchiveTarget(null);
        }}
      />
    </div>
  );
}
