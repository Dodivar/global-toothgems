import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  BadgeEuro,
  CalendarRange,
  CircleDot,
  Copy,
  FolderMinus,
  History,
  MonitorSmartphone,
  Package,
  PackagePlus,
  Pause,
  Pencil,
  Percent,
  Play,
  Plus,
  SearchX,
  ShoppingBag,
  Tag,
  TicketPercent,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { OverflowMenu } from "../../components/admin/OverflowMenu";
import { usePromotions } from "../../lib/adminPromotions";
import { useToast } from "../../lib/toast";
import { useLocalized } from "../../lib/localized";
import { campaignRollup } from "../../lib/promotionRules";
import { campaignStatus, daysFromNow, promotionStatus, type Campaign, type CampaignLifecycle } from "../../data/adminPromotions";
import { CampaignStatusBadge, DiscountChip, PromotionStatusBadge, useDiscountLabel, useMoney, usePromoDates } from "../../components/promotions/PromoBadges";
import { FormDialog, Notice, Panel, PromoKpi, PrototypeBar } from "../../components/promotions/PromoUi";
import { ProductPicker, ProductStrip } from "../../components/promotions/ProductPicker";
import { CampaignCover } from "../../components/promotions/Visuals";
import { PreviewCampaignLanding, PreviewFrame } from "../../components/promotions/StorefrontPreviews";
import { PromoEmpty } from "../../components/promotions/PromoEmpty";
import { ScheduleTimeline } from "../../components/promotions/Timeline";
import { useAdminShell } from "./AdminLayout";

/**
 * One campaign: its banner, its dates, what it contains and how it performs.
 *
 * The page is built around the relationship the brief asks the admin to see —
 * campaign → promotions → products → storefront. Every promotion row opens the
 * promotion, every product opens the catalogue entry, and the banner preview
 * shows what a customer lands on. The two "empty" relationships (no promotions,
 * no products) are designed states with the action that fills them.
 */
export function CampaignDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const store = usePromotions();
  const campaign = store.getCampaign(id);
  const [busy, setBusy] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [addPromoOpen, setAddPromoOpen] = useState(false);
  const [addProductsOpen, setAddProductsOpen] = useState(false);
  const money = useMoney();

  if (!campaign) {
    return (
      <>
        <AdminHeader title={t("promo.notFound.campaign")} onOpenNav={openNav} crumbs={[{ label: t("admin.nav.promotions"), to: "/admin/promotions?vue=campagnes" }]} />
        <div className="px-[var(--admin-gutter)] pt-5">
          <div className="gt-admin-panel">
            <PromoEmpty
              icon={SearchX}
              tone="neutral"
              title={t("promo.notFound.campaign")}
              body={t("promo.notFound.campaignBody")}
              actions={<AdminButton variant="dark" onClick={() => navigate("/admin/promotions?vue=campagnes")}>{t("promo.common.backToCampaigns")}</AdminButton>}
            />
          </div>
        </div>
      </>
    );
  }

  const status = campaignStatus(campaign);
  const rollup = campaignRollup(campaign, store.promotions);

  const setLifecycle = async (lifecycle: CampaignLifecycle) => {
    setBusy(true);
    await store.setCampaignLifecycle(campaign.id, lifecycle);
    setBusy(false);
    showToast(t(`promo.toast.campaign.${lifecycle}`, { name: campaign.name }), undefined, lifecycle === "paused" ? "warning" : lifecycle === "archived" ? "info" : "success");
  };
  const duplicate = async () => {
    setBusy(true);
    const copy = await store.duplicateCampaign(campaign.id);
    setBusy(false);
    if (copy) {
      showToast(t("promo.toast.campaignDuplicated", { name: campaign.name }), t("promo.toast.campaignDuplicatedBody"));
      navigate(`/admin/promotions/campagnes/${copy.id}/modifier`);
    }
  };

  const canPause = status === "active" || status === "scheduled";
  const canResume = status === "paused" || status === "draft";

  return (
    <>
      <AdminHeader
        title={campaign.name}
        description={t("promo.campaigns.detailDescription")}
        crumbs={[
          { label: t("admin.nav.promotions"), to: "/admin/promotions" },
          { label: t("promo.tabs.campaigns"), to: "/admin/promotions?vue=campagnes" },
          { label: campaign.name },
        ]}
        onOpenNav={openNav}
        actions={
          <>
            <span><span className="hidden sm:inline-flex"><AdminButton variant="outline" iconLeft={Pencil} onClick={() => navigate(`/admin/promotions/campagnes/${campaign.id}/modifier`)}>
              {t("promo.campaigns.edit")}
            </AdminButton></span></span>
            <span><span className="hidden sm:inline-flex"><AdminButton variant="primary" iconLeft={Plus} onClick={() => setAddPromoOpen(true)} disabled={status === "archived"}>
              {t("promo.campaigns.addPromotion")}
            </AdminButton></span></span>
            <OverflowMenu
              label={t("promo.actions.more", { name: campaign.name })}
              actions={[
                { id: "edit", label: t("promo.campaigns.edit"), icon: Pencil, onSelect: () => navigate(`/admin/promotions/campagnes/${campaign.id}/modifier`) },
                { id: "promo", label: t("promo.campaigns.addPromotion"), icon: Plus, onSelect: () => setAddPromoOpen(true), disabled: status === "archived" },
                { id: "products", label: t("promo.campaigns.addProducts"), icon: PackagePlus, onSelect: () => setAddProductsOpen(true), disabled: status === "archived" },
                { id: "dup", label: t("promo.campaigns.duplicate"), icon: Copy, onSelect: duplicate },
                ...(canPause ? [{ id: "pause", label: t("promo.campaigns.pause"), icon: Pause, onSelect: () => setLifecycle("paused") }] : []),
                ...(canResume ? [{ id: "resume", label: t("promo.campaigns.activate"), icon: Play, onSelect: () => setLifecycle("live") }] : []),
                ...(status !== "archived" ? [{ id: "archive", label: t("promo.campaigns.archive"), icon: Archive, onSelect: () => setArchiveOpen(true), tone: "danger" as const, separated: true }] : []),
              ]}
            />
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <PrototypeBar showModes={false} />
        <Hero campaign={campaign} onPause={() => setLifecycle("paused")} onResume={() => setLifecycle("live")} busy={busy} />

        <section aria-label={t("promo.campaigns.performance")} className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <PromoKpi icon={BadgeEuro} tone="success" label={t("promo.metrics.revenue")} value={money(rollup.revenueCents)} />
          <PromoKpi icon={ShoppingBag} label={t("promo.metrics.orders")} value={String(rollup.orders)} />
          <PromoKpi icon={TicketPercent} tone="brand" label={t("promo.metrics.uses")} value={String(rollup.uses)} />
          <PromoKpi icon={Percent} tone="highlight" label={t("promo.metrics.discount")} value={money(rollup.discountCents)} />
          <PromoKpi icon={Tag} label={t("promo.campaigns.promotionsLabel")} value={String(rollup.promotions.length)} hint={t("promo.campaigns.productCount", { count: campaign.productIds.length })} />
        </section>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            <PromotionsPanel campaign={campaign} onAdd={() => setAddPromoOpen(true)} />
            <Panel
              title={t("promo.campaigns.products")}
              icon={Package}
              action={
                campaign.productIds.length > 0 && status !== "archived" ? (
                  <AdminButton size="sm" variant="outline" iconLeft={PackagePlus} onClick={() => setAddProductsOpen(true)}>
                    {t("promo.campaigns.addProducts")}
                  </AdminButton>
                ) : undefined
              }
            >
              {campaign.productIds.length === 0 ? (
                <PromoEmpty
                  compact
                  icon={Package}
                  tone="neutral"
                  title={t("promo.empty.campaignNoProducts.title")}
                  body={t("promo.empty.campaignNoProducts.body")}
                  actions={
                    <AdminButton variant="dark" iconLeft={PackagePlus} onClick={() => setAddProductsOpen(true)} disabled={status === "archived"}>
                      {t("promo.campaigns.addProducts")}
                    </AdminButton>
                  }
                />
              ) : (
                <ProductStrip ids={campaign.productIds} max={8} />
              )}
            </Panel>
            <Panel title={t("promo.campaigns.dates")} icon={CalendarRange}>
              <ScheduleTimeline startsAt={campaign.startsAt} endsAt={campaign.endsAt} />
            </Panel>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:sticky xl:top-[calc(var(--admin-header-h)+16px)]">
            <Panel title={t("promo.campaigns.bannerPreview")} icon={MonitorSmartphone}>
              <PreviewFrame label={t("promo.preview.landing")}>
                <PreviewCampaignLanding campaign={campaign} promotions={rollup.promotions.filter((p) => promotionStatus(p) !== "archived")} productIds={campaign.productIds} />
              </PreviewFrame>
              <Link
                to={`/admin/promotions/apercu?campagne=${campaign.id}`}
                className="text-[length:var(--text-caption)] font-semibold underline underline-offset-2 hover:text-[var(--accent-highlight-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {t("promo.detail.openPreview")}
              </Link>
            </Panel>
            <ActivityPanel campaign={campaign} />
          </div>
        </div>
      </div>

      <AddPromotionsDialog campaign={campaign} open={addPromoOpen} onClose={() => setAddPromoOpen(false)} />
      <AddProductsDialog campaign={campaign} open={addProductsOpen} onClose={() => setAddProductsOpen(false)} />
      <ConfirmationDialog
        open={archiveOpen}
        icon={Archive}
        title={t("promo.dialogs.archiveCampaign.title", { name: campaign.name })}
        body={t("promo.dialogs.archiveCampaign.body")}
        confirmLabel={t("promo.dialogs.archiveCampaign.confirm")}
        cancelLabel={t("promo.common.cancel")}
        tone="danger"
        loading={busy}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={async () => {
          await setLifecycle("archived");
          setArchiveOpen(false);
        }}
      />
    </>
  );
}

function Hero({ campaign, onPause, onResume, busy }: { campaign: Campaign; onPause: () => void; onResume: () => void; busy: boolean }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { date } = usePromoDates();
  const status = campaignStatus(campaign);
  return (
    <section className="gt-admin-panel overflow-hidden">
      <CampaignCover
        theme={campaign.theme}
        cover={campaign.cover}
        title={l(campaign.title) || campaign.name}
        eyebrow={`${date(campaign.startsAt)} → ${date(campaign.endsAt)}`}
        subtitle={l(campaign.description)}
        size="lg"
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span key={status} className="gt-status-swap">
            <CampaignStatusBadge status={status} size="md" />
          </span>
          {status === "scheduled" && (
            <span className="text-[length:var(--text-caption)] font-semibold text-[var(--gt-blue-700)]">
              {t("promo.timeline.startsIn", { count: Math.max(1, daysFromNow(campaign.startsAt)) })}
            </span>
          )}
          {status === "active" && (
            <span className="text-[length:var(--text-caption)] font-semibold text-[var(--status-success-fg)]">
              {t("promo.timeline.endsIn", { count: Math.max(0, daysFromNow(campaign.endsAt)) })}
            </span>
          )}
        </div>
        {campaign.internalDescription && (
          <p className="m-0 max-w-[80ch] text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            <span className="font-semibold">{t("promo.detail.internalNote")} </span>
            {campaign.internalDescription}
          </p>
        )}
        {status === "paused" && (
          <Notice
            tone="warning"
            icon={Pause}
            title={t("promo.campaigns.pausedTitle")}
            action={
              <AdminButton size="sm" variant="primary" iconLeft={Play} loading={busy} onClick={onResume}>
                {t("promo.campaigns.activate")}
              </AdminButton>
            }
          >
            {t("promo.campaigns.pausedBody")}
          </Notice>
        )}
        {status === "draft" && (
          <Notice
            tone="info"
            title={t("promo.campaigns.draftTitle")}
            action={
              <AdminButton size="sm" variant="primary" iconLeft={Play} loading={busy} onClick={onResume}>
                {t("promo.campaigns.schedule")}
              </AdminButton>
            }
          >
            {t("promo.campaigns.draftBody")}
          </Notice>
        )}
        {status === "active" && (
          <div className="flex justify-start">
            <AdminButton size="sm" variant="ghost" iconLeft={Pause} loading={busy} onClick={onPause}>
              {t("promo.campaigns.pause")}
            </AdminButton>
          </div>
        )}
        {status === "completed" && <Notice tone="info" icon={History} title={t("promo.campaigns.completedTitle", { date: date(campaign.endsAt) })}>{t("promo.campaigns.completedBody")}</Notice>}
        {status === "archived" && <Notice tone="info" icon={Archive} title={t("promo.campaigns.archivedTitle")}>{t("promo.campaigns.archivedBody")}</Notice>}
      </div>
    </section>
  );
}

function PromotionsPanel({ campaign, onAdd }: { campaign: Campaign; onAdd: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = usePromotions();
  const { showToast } = useToast();
  const discount = useDiscountLabel();
  const { date } = usePromoDates();
  const own = store.promotions.filter((p) => p.campaignId === campaign.id);
  const archived = campaignStatus(campaign) === "archived";

  return (
    <Panel
      title={t("promo.campaigns.promotionsLabel")}
      icon={Tag}
      action={
        own.length > 0 && !archived ? (
          <AdminButton size="sm" variant="outline" iconLeft={Plus} onClick={onAdd}>
            {t("promo.campaigns.addPromotion")}
          </AdminButton>
        ) : undefined
      }
    >
      {own.length === 0 ? (
        <PromoEmpty
          compact
          icon={TicketPercent}
          tone="highlight"
          title={t("promo.empty.campaignNoPromotions.title")}
          body={t("promo.empty.campaignNoPromotions.body")}
          actions={
            <>
              <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate(`/admin/promotions/nouvelle?campagne=${campaign.id}`)} disabled={archived}>
                {t("promo.campaigns.createInside")}
              </AdminButton>
              <AdminButton variant="outline" onClick={onAdd} disabled={archived}>
                {t("promo.campaigns.attachExisting")}
              </AdminButton>
            </>
          }
        />
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0">
          {own.map((p) => {
            const status = promotionStatus(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-3 transition-colors hover:bg-[var(--gt-blue-50)]">
                <div className="grid min-w-0 flex-1 gap-1">
                  <Link to={`/admin/promotions/${p.id}`} className="w-fit rounded-[2px] font-semibold text-[var(--text-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
                    {p.name}
                  </Link>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {date(p.schedule.startsAt)} → {p.schedule.endsAt ? date(p.schedule.endsAt) : t("promo.timeline.noEnd")} · {t("promo.table.uses", { count: p.stats.uses })}
                  </span>
                </div>
                <DiscountChip label={discount(p)} size="sm" />
                <PromotionStatusBadge status={status} />
                {!archived && (
                  <button
                    type="button"
                    onClick={async () => {
                      await store.assignCampaign([p.id], null);
                      showToast(t("promo.toast.unassigned", { count: 1 }), p.name, "info");
                    }}
                    aria-label={t("promo.campaigns.removeNamed", { name: p.name })}
                    title={t("promo.campaigns.removeNamed", { name: p.name })}
                    className="grid h-8 w-8 place-items-center rounded-[var(--admin-radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    <FolderMinus size={15} aria-hidden="true" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function ActivityPanel({ campaign }: { campaign: Campaign }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { dateTime } = usePromoDates();
  const entries = [...campaign.activity].reverse();
  return (
    <Panel title={t("promo.campaigns.activity")} icon={History}>
      <ol className="m-0 grid list-none gap-0 p-0">
        {entries.map((entry, i) => (
          <li key={entry.id} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
            {i < entries.length - 1 && <span aria-hidden="true" className="absolute left-[9px] top-5 h-[calc(100%-12px)] w-px bg-[var(--border-subtle)]" />}
            <span
              aria-hidden="true"
              className={clsx(
                "mt-0.5 grid h-5 w-5 place-items-center rounded-full",
                i === 0 ? "bg-[var(--gt-ink-900)] text-[var(--gt-white)]" : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
              )}
            >
              <CircleDot size={11} />
            </span>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
              <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{l(entry.detail)}</span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {entry.actor} · <time dateTime={entry.at}>{dateTime(entry.at)}</time>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function AddPromotionsDialog({ campaign, open, onClose }: { campaign: Campaign; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = usePromotions();
  const { showToast } = useToast();
  const discount = useDiscountLabel();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const candidates = store.promotions.filter((p) => p.campaignId !== campaign.id && !["archived", "expired"].includes(promotionStatus(p)));

  return (
    <FormDialog
      open={open}
      wide
      icon={Plus}
      title={t("promo.dialogs.addPromotions.title", { name: campaign.name })}
      description={t("promo.dialogs.addPromotions.body")}
      confirmLabel={t("promo.dialogs.addPromotions.confirm", { count: picked.length })}
      cancelLabel={t("promo.common.cancel")}
      confirmDisabled={picked.length === 0}
      loading={busy}
      onClose={() => {
        setPicked([]);
        onClose();
      }}
      onConfirm={async () => {
        setBusy(true);
        await store.assignCampaign(picked, campaign.id);
        setBusy(false);
        showToast(t("promo.toast.assigned", { count: picked.length, name: campaign.name }));
        setPicked([]);
        onClose();
      }}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <AdminButton variant="outline" iconLeft={Plus} onClick={() => navigate(`/admin/promotions/nouvelle?campagne=${campaign.id}`)}>
          {t("promo.campaigns.createInside")}
        </AdminButton>
        {candidates.length === 0 ? (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("promo.dialogs.addPromotions.none")}</p>
        ) : (
          <fieldset className="m-0 grid gap-1.5 border-0 p-0">
            <legend className="mb-1.5 p-0 text-[length:var(--text-caption)] font-semibold">{t("promo.dialogs.addPromotions.existing")}</legend>
            {candidates.map((p) => {
              const on = picked.includes(p.id);
              return (
                <label key={p.id} className={clsx("flex cursor-pointer items-center gap-3 rounded-[var(--admin-radius-sm)] border p-2.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus-ring)]", on ? "border-[var(--gt-ink-900)] bg-[var(--gt-blue-50)]" : "border-[var(--border-subtle)] hover:border-[var(--gt-ink-400)]")}>
                  <input type="checkbox" checked={on} onChange={() => setPicked((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))} className="h-4 w-4 accent-[var(--gt-ink-900)]" />
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-[length:var(--text-body-sm)] font-semibold">{p.name}</span>
                    <span className="truncate text-[11px] text-[var(--text-muted)]">{p.campaignId ? t("promo.dialogs.addPromotions.moveFrom", { name: store.campaignName(p.campaignId) }) : t("promo.table.standalone")}</span>
                  </span>
                  <DiscountChip label={discount(p)} size="sm" />
                  <PromotionStatusBadge status={promotionStatus(p)} />
                </label>
              );
            })}
          </fieldset>
        )}
      </div>
    </FormDialog>
  );
}

function AddProductsDialog({ campaign, open, onClose }: { campaign: Campaign; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const store = usePromotions();
  const { showToast } = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <FormDialog
      open={open}
      wide
      icon={PackagePlus}
      title={t("promo.dialogs.addProducts.title", { name: campaign.name })}
      description={t("promo.dialogs.addProducts.body")}
      confirmLabel={t("promo.dialogs.addProducts.confirm", { count: picked.length })}
      cancelLabel={t("promo.common.cancel")}
      confirmDisabled={picked.length === 0}
      loading={busy}
      onClose={() => {
        setPicked([]);
        onClose();
      }}
      onConfirm={async () => {
        setBusy(true);
        await store.addCampaignProducts(campaign.id, picked);
        setBusy(false);
        showToast(t("promo.toast.productsAdded", { count: picked.length, name: campaign.name }));
        setPicked([]);
        onClose();
      }}
    >
      <ProductPicker label={t("promo.dialogs.addProducts.field")} selected={picked} onChange={setPicked} excludeIds={campaign.productIds} />
    </FormDialog>
  );
}
