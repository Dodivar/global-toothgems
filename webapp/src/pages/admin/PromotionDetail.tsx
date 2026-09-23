import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  BadgeEuro,
  BarChart3,
  CalendarRange,
  Copy,
  Gauge,
  History,
  KeyRound,
  Megaphone,
  MonitorSmartphone,
  Pause,
  Pencil,
  Percent,
  Play,
  Receipt,
  RotateCcw,
  SearchX,
  ShieldCheck,
  ShoppingBag,
  Tags,
  TicketPercent,
  Users,
} from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { ConfirmationDialog } from "../../components/admin/ConfirmationDialog";
import { OverflowMenu } from "../../components/admin/OverflowMenu";
import { usePromotions } from "../../lib/adminPromotions";
import { useToast } from "../../lib/toast";
import { useLocalized } from "../../lib/localized";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { coveredProductIds, validatePromotion } from "../../lib/promotionRules";
import { COLLECTIONS, SEGMENTS, daysFromNow, promotionStatus, type Promotion, type PromotionLifecycle } from "../../data/adminPromotions";
import { categoryById, type CategoryId } from "../../data/adminCatalog";
import {
  CampaignStatusBadge,
  CodeTag,
  DiscountChip,
  PromotionStatusBadge,
  PromotionTypeLabel,
  useDiscountLabel,
  useMoney,
  usePromoDates,
} from "../../components/promotions/PromoBadges";
import { CopyButton, Fact, Notice, Panel, PromoKpi, PrototypeBar, UsageMeter } from "../../components/promotions/PromoUi";
import { ProductStrip, useProductsByCategory } from "../../components/promotions/ProductPicker";
import { ScheduleTimeline } from "../../components/promotions/Timeline";
import { CampaignCover } from "../../components/promotions/Visuals";
import { PreviewFrame, PreviewProductCard, usePreviewProduct } from "../../components/promotions/StorefrontPreviews";
import { PromoEmpty } from "../../components/promotions/PromoEmpty";
import { campaignStatus } from "../../data/adminPromotions";
import { useAdminShell } from "./AdminLayout";

/**
 * One promotion, read-only.
 *
 * The header carries the three things done most from here — edit, pause or
 * activate, duplicate — and a banner under it explains the state in words
 * whenever the state is not simply "running": ended, paused, scheduled, or
 * broken. Below, performance first (it is what people open a promotion to
 * check), then the configuration section by section in the editor's order, so
 * "where do I change this?" always has the same answer.
 */
export function PromotionDetail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { openNav } = useAdminShell();
  const { showToast } = useToast();
  const store = usePromotions();
  const promotion = store.getPromotion(id);
  const [busy, setBusy] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  if (!promotion) {
    return (
      <>
        <AdminHeader title={t("promo.notFound.promotion")} onOpenNav={openNav} crumbs={[{ label: t("admin.nav.promotions"), to: "/admin/promotions" }]} />
        <div className="px-[var(--admin-gutter)] pt-5">
          <div className="gt-admin-panel">
            <PromoEmpty
              icon={SearchX}
              tone="neutral"
              title={t("promo.notFound.promotion")}
              body={t("promo.notFound.promotionBody")}
              actions={<AdminButton variant="dark" onClick={() => navigate("/admin/promotions")}>{t("promo.common.backToList")}</AdminButton>}
            />
          </div>
        </div>
      </>
    );
  }

  const status = promotionStatus(promotion);
  const setLifecycle = async (lifecycle: PromotionLifecycle) => {
    setBusy(true);
    await store.setPromotionLifecycle([promotion.id], lifecycle);
    setBusy(false);
    showToast(t(`promo.toast.lifecycle.${lifecycle}`, { name: promotion.name }), undefined, lifecycle === "paused" ? "warning" : "success");
  };
  const duplicate = async () => {
    setBusy(true);
    const [copy] = await store.duplicatePromotions([promotion.id]);
    setBusy(false);
    showToast(t("promo.toast.duplicated", { count: 1 }), t("promo.toast.duplicatedBody"));
    if (copy) navigate(`/admin/promotions/${copy.id}/modifier`);
  };

  const canPause = status === "active" || status === "scheduled";
  const canActivate = status === "paused" || status === "draft";

  return (
    <>
      <AdminHeader
        title={promotion.name}
        description={t(`promo.type.${promotion.discount.type}`)}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.promotions"), to: "/admin/promotions" }, { label: promotion.name }]}
        onOpenNav={openNav}
        actions={
          <>
            <span className="hidden sm:inline-flex"><AdminButton variant="outline" iconLeft={Pencil} onClick={() => navigate(`/admin/promotions/${promotion.id}/modifier`)}>
              {t("promo.actions.edit")}
            </AdminButton></span>
            {canPause && (
              <span className="hidden sm:inline-flex"><AdminButton variant="outline" iconLeft={Pause} loading={busy} onClick={() => setLifecycle("paused")}>
                {t("promo.actions.pause")}
              </AdminButton></span>
            )}
            {canActivate && (
              <span className="hidden sm:inline-flex"><AdminButton variant="primary" iconLeft={Play} loading={busy} disabled={validatePromotion(promotion).length > 0} onClick={() => setLifecycle("live")}>
                {t("promo.actions.activate")}
              </AdminButton></span>
            )}
            <span><span className="hidden lg:inline-flex"><AdminButton variant="ghost" iconLeft={Copy} onClick={duplicate} disabled={busy}>
              {t("promo.actions.duplicate")}
            </AdminButton></span></span>
            <OverflowMenu
              label={t("promo.actions.more", { name: promotion.name })}
              actions={[
                { id: "edit", label: t("promo.actions.edit"), icon: Pencil, onSelect: () => navigate(`/admin/promotions/${promotion.id}/modifier`) },
                ...(canPause ? [{ id: "pause", label: t("promo.actions.pause"), icon: Pause, onSelect: () => setLifecycle("paused") }] : []),
                ...(canActivate ? [{ id: "activate", label: t("promo.actions.activate"), icon: Play, onSelect: () => setLifecycle("live"), disabled: validatePromotion(promotion).length > 0 }] : []),
                { id: "dup", label: t("promo.actions.duplicate"), icon: Copy, onSelect: duplicate },
                { id: "preview", label: t("promo.actions.preview"), icon: MonitorSmartphone, onSelect: () => navigate(`/admin/promotions/apercu?promotion=${promotion.id}`) },
                ...(status === "archived"
                  ? [{ id: "restore", label: t("promo.actions.restore"), icon: RotateCcw, onSelect: () => setLifecycle("draft") }]
                  : [{ id: "archive", label: t("promo.actions.archive"), icon: Archive, onSelect: () => setArchiveOpen(true), tone: "danger" as const, separated: true }]),
              ]}
            />
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <PrototypeBar showModes={false} />
        <Hero promotion={promotion} onActivate={() => setLifecycle("live")} onDuplicate={duplicate} busy={busy} />
        <Performance promotion={promotion} />
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Configuration promotion={promotion} />
          <Aside promotion={promotion} />
        </div>
      </div>

      <ConfirmationDialog
        open={archiveOpen}
        icon={Archive}
        title={t("promo.dialogs.archiveOne.title", { name: promotion.name })}
        body={t("promo.dialogs.archiveOne.body")}
        confirmLabel={t("promo.dialogs.archiveOne.confirm")}
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

/* -------------------------------------------------------------------------- */

function Hero({ promotion, onActivate, onDuplicate, busy }: { promotion: Promotion; onActivate: () => void; onDuplicate: () => void; busy: boolean }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const navigate = useNavigate();
  const discount = useDiscountLabel();
  const { date, dateTime } = usePromoDates();
  const { getCampaign } = usePromotions();
  const status = promotionStatus(promotion);
  const issues = validatePromotion(promotion);
  const campaign = promotion.campaignId ? getCampaign(promotion.campaignId) : undefined;

  return (
    <section className="gt-admin-panel grid gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span key={status} className="gt-status-swap">
          <PromotionStatusBadge status={status} size="md" />
        </span>
        <DiscountChip label={discount(promotion)} />
        <PromotionTypeLabel type={promotion.discount.type} />
        {campaign && (
          <Link
            to={`/admin/promotions/campagnes/${campaign.id}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] px-2.5 text-[length:var(--text-caption)] font-semibold text-[var(--gt-blue-700)] hover:border-[var(--gt-blue-400)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <Megaphone size={13} aria-hidden="true" />
            {t("promo.detail.partOf", { name: campaign.name })}
          </Link>
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
        <p className="m-0 text-[length:var(--text-h4)] font-semibold text-[var(--text-primary)]">{l(promotion.customerTitle) || promotion.name}</p>
        {l(promotion.customerDescription) && <p className="m-0 max-w-[70ch] text-[length:var(--text-body-sm)] text-[var(--text-body)]">{l(promotion.customerDescription)}</p>}
        {promotion.internalDescription && (
          <p className="m-0 max-w-[70ch] text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <span className="font-semibold">{t("promo.detail.internalNote")} </span>
            {promotion.internalDescription}
          </p>
        )}
      </div>

      {issues.length > 0 && (
        <Notice
          tone="error"
          title={t("promo.detail.invalidTitle", { count: issues.length })}
          action={
            <AdminButton size="sm" variant="dark" iconLeft={Pencil} onClick={() => navigate(`/admin/promotions/${promotion.id}/modifier`)}>
              {t("promo.detail.fix")}
            </AdminButton>
          }
        >
          <ul className="m-0 mt-1 list-disc pl-4">
            {issues.map((i) => (
              <li key={i.key}>{t(`promo.validation.${i.key}`)}</li>
            ))}
          </ul>
        </Notice>
      )}
      {status === "expired" && promotion.schedule.endsAt && (
        <Notice
          tone="info"
          icon={History}
          title={t("promo.detail.expiredTitle", { date: dateTime(promotion.schedule.endsAt) })}
          action={
            <AdminButton size="sm" variant="outline" iconLeft={Copy} onClick={onDuplicate} disabled={busy}>
              {t("promo.detail.runAgain")}
            </AdminButton>
          }
        >
          {t("promo.detail.expiredBody")}
        </Notice>
      )}
      {status === "paused" && (
        <Notice
          tone="warning"
          icon={Pause}
          title={t("promo.detail.pausedTitle", { date: date(promotion.updatedAt), name: promotion.updatedBy })}
          action={
            <AdminButton size="sm" variant="primary" iconLeft={Play} onClick={onActivate} loading={busy}>
              {t("promo.detail.resume")}
            </AdminButton>
          }
        >
          {t("promo.detail.pausedBody")}
        </Notice>
      )}
      {status === "scheduled" && (
        <Notice tone="info" icon={CalendarRange} title={t("promo.detail.scheduledTitle", { count: Math.max(1, daysFromNow(promotion.schedule.startsAt)) })}>
          {t("promo.detail.scheduledBody", { date: dateTime(promotion.schedule.startsAt) })}
        </Notice>
      )}
      {status === "draft" && issues.length === 0 && (
        <Notice tone="info" title={t("promo.detail.draftTitle")}>
          {t("promo.detail.draftBody")}
        </Notice>
      )}
      {campaign && campaignStatus(campaign) === "paused" && status === "active" && (
        <Notice tone="warning" title={t("promo.detail.campaignPaused", { name: campaign.name })} />
      )}
    </section>
  );
}

/** Daily uses as bars. The totals above it are the information; this is shape. */
function DailyBars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  return (
    <figure className="m-0 grid gap-2">
      <figcaption className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{label}</figcaption>
      <div className="flex h-24 items-end gap-[3px]" role="img" aria-label={`${label}: ${values.join(", ")}`}>
        {values.map((v, i) => (
          <span
            key={i}
            className="flex-1 rounded-t-[3px] bg-[var(--gt-blue-400)] transition-[height] duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] last:bg-[var(--gt-emerald-500)]"
            style={{ height: `${Math.max(3, (v / max) * 100)}%` }}
          />
        ))}
      </div>
    </figure>
  );
}

function Performance({ promotion }: { promotion: Promotion }) {
  const { t } = useTranslation();
  const money = useMoney();
  const s = promotion.stats;
  const aov = s.orders ? Math.round(s.revenueCents / s.orders) : 0;
  const empty = s.uses === 0;

  return (
    <Panel title={t("promo.detail.performance")} icon={BarChart3}>
      {empty ? (
        <p className="m-0 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] px-4 py-6 text-center text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("promo.detail.noPerformance")}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <PromoKpi icon={BadgeEuro} tone="success" label={t("promo.metrics.revenue")} value={money(s.revenueCents)} />
            <PromoKpi icon={ShoppingBag} label={t("promo.metrics.orders")} value={String(s.orders)} />
            <PromoKpi icon={Receipt} label={t("promo.metrics.aov")} value={money(aov)} />
            <PromoKpi icon={TicketPercent} tone="brand" label={t("promo.metrics.uses")} value={String(s.uses)} hint={promotion.usage.maxTotal ? t("promo.metrics.ofMax", { max: promotion.usage.maxTotal }) : undefined} />
            <PromoKpi icon={Gauge} tone="brand" label={t("promo.metrics.conversion")} value={`${s.conversionRate.toLocaleString()} %`} />
            <PromoKpi icon={Percent} tone="highlight" label={t("promo.metrics.discount")} value={money(s.discountCents)} hint={s.revenueCents ? t("promo.metrics.discountShare", { value: Math.round((s.discountCents / (s.revenueCents + s.discountCents)) * 100) }) : undefined} />
          </div>
          <div className="rounded-[var(--admin-radius)] border border-[var(--border-subtle)] p-4">
            <DailyBars values={s.daily} label={t("promo.metrics.daily")} />
            <p className="m-0 mt-2 text-[11px] text-[var(--text-muted)]">{t("promo.metrics.dailyHint")}</p>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Configuration({ promotion }: { promotion: Promotion }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const money = useMoney();
  const { products } = useAdminCatalog();
  const byCategory = useProductsByCategory();
  const d = promotion.discount;
  const e = promotion.eligibility;
  const u = promotion.usage;
  const covered = coveredProductIds(promotion, byCategory);
  const productName = (id?: string) => l(products.find((p) => p.id === id)?.name ?? { fr: "—", en: "—" });
  const yes = (v: boolean) => (v ? t("promo.common.yes") : t("promo.common.no"));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Panel title={t("promo.detail.discountConfig")} icon={Percent}>
        <dl className="m-0 grid gap-4 sm:grid-cols-3">
          <Fact label={t("promo.table.type")} value={t(`promo.type.${d.type}`)} />
          {d.type === "percentage" && (
            <>
              <Fact label={t("promo.editor.discount.percent")} value={`${d.percent} %`} />
              <Fact label={t("promo.editor.discount.maxDiscount")} value={d.maxDiscountCents ? money(d.maxDiscountCents) : t("promo.editor.noLimit")} />
            </>
          )}
          {d.type === "fixed" && (
            <>
              <Fact label={t("promo.editor.discount.amount")} value={money(d.amountCents ?? 0)} />
              <Fact label={t("promo.editor.discount.minOrder")} value={d.minOrderCents ? money(d.minOrderCents) : t("promo.editor.noMinimum")} />
            </>
          )}
          {d.type === "bxgy" && (
            <>
              <Fact label={t("promo.editor.discount.buyQty")} value={d.buyQty} />
              <Fact label={t("promo.editor.discount.getQty")} value={`${d.getQty} · ${d.rewardPercent === 50 ? t("promo.editor.discount.rewardHalf") : t("promo.editor.discount.rewardFree")}`} />
            </>
          )}
          {d.type === "freeShipping" && <Fact label={t("promo.editor.discount.minOrder")} value={d.minOrderCents ? money(d.minOrderCents) : t("promo.editor.noMinimum")} />}
          {d.type === "bundle" && (
            <>
              <Fact label={t("promo.editor.discount.bundleProducts")} value={(d.bundleProductIds ?? []).map(productName).join(" + ")} />
              <Fact label={t("promo.editor.discount.bundlePrice")} value={money(d.bundlePriceCents ?? 0)} />
            </>
          )}
          {d.type === "gift" && (
            <>
              <Fact label={t("promo.editor.discount.giftProduct")} value={productName(d.giftProductId)} />
              <Fact label={t("promo.editor.discount.minOrder")} value={d.minOrderCents ? money(d.minOrderCents) : t("promo.editor.noMinimum")} />
            </>
          )}
        </dl>
      </Panel>

      <Panel title={t("promo.detail.eligibleProducts")} icon={Tags}>
        {covered === null ? (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("promo.detail.allProducts", { count: products.length })}</p>
        ) : (
          <>
            {e.scope === "categories" && (
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("promo.detail.viaCategories", { names: e.categoryIds.map((c) => l(categoryById(c as CategoryId).name)).join(", ") })}
              </p>
            )}
            {e.scope === "collections" && (
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("promo.detail.viaCollections", { names: e.collectionIds.map((c) => l(COLLECTIONS.find((x) => x.id === c)?.name ?? { fr: c, en: c })).join(", ") })}
              </p>
            )}
            <ProductStrip ids={covered} emptyLabel={t("promo.detail.noProducts")} />
          </>
        )}
      </Panel>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <Panel title={t("promo.detail.eligibility")} icon={Users}>
          <dl className="m-0 grid gap-3">
            <Fact
              label={t("promo.editor.eligibility.customersHeading")}
              value={
                e.customers === "segments"
                  ? e.segmentIds.map((s) => l(SEGMENTS.find((x) => x.id === s)?.name ?? { fr: s, en: s })).join(", ")
                  : t(`promo.editor.eligibility.customers.${e.customers}`)
              }
            />
            <Fact label={t("promo.editor.eligibility.minCart")} value={e.minCartCents ? money(e.minCartCents) : t("promo.editor.noMinimum")} />
            <Fact label={t("promo.editor.eligibility.minQty")} value={e.minQuantity ?? t("promo.editor.noMinimum")} />
          </dl>
        </Panel>
        <Panel title={t("promo.detail.usage")} icon={ShieldCheck}>
          <UsageMeter
            used={promotion.stats.uses}
            max={u.maxTotal}
            label={u.maxTotal ? t("promo.table.usesOf", { used: promotion.stats.uses, max: u.maxTotal }) : t("promo.table.uses", { count: promotion.stats.uses })}
          />
          <dl className="m-0 grid grid-cols-2 gap-3">
            <Fact label={t("promo.editor.usage.maxPerCustomer")} value={u.maxPerCustomer ?? t("promo.editor.noLimit")} />
            <Fact label={t("promo.editor.usage.combinableShort")} value={yes(u.combinable)} />
            <Fact label={t("promo.editor.usage.excludeDiscounted")} value={yes(u.excludeDiscounted)} />
            <Fact label={t("promo.editor.usage.excludeGiftCards")} value={yes(u.excludeGiftCards)} />
          </dl>
          {u.excludedProductIds.length > 0 && (
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
              {t("promo.detail.excluded", { names: u.excludedProductIds.map(productName).join(", ") })}
            </p>
          )}
        </Panel>
      </div>

      <Panel title={t("promo.detail.schedule")} icon={CalendarRange} action={<span className="text-[11px] text-[var(--text-muted)]">{promotion.schedule.timezone}</span>}>
        <ScheduleTimeline startsAt={promotion.schedule.startsAt} endsAt={promotion.schedule.endsAt} invalid={validatePromotion(promotion).some((i) => i.field === "schedule")} />
      </Panel>
    </div>
  );
}

function Aside({ promotion }: { promotion: Promotion }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { getCampaign } = usePromotions();
  const { showToast } = useToast();
  const { dateTime } = usePromoDates();
  const product = usePreviewProduct(promotion);
  const campaign = promotion.campaignId ? getCampaign(promotion.campaignId) : undefined;
  const c = promotion.code;

  return (
    <aside className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:sticky xl:top-[calc(var(--admin-header-h)+16px)]">
      <Panel title={t("promo.detail.code")} icon={KeyRound}>
        {c.mode === "automatic" ? (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t("promo.detail.automaticBody")}</p>
        ) : c.code ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <div className="flex items-center justify-between gap-2 rounded-[var(--admin-radius-sm)] border border-dashed border-[var(--gt-ink-400)] bg-[var(--admin-panel-sunken)] px-3 py-2.5">
              <span className="font-[family-name:var(--gt-font-mono)] text-[length:var(--text-body-md)] font-bold tracking-[.08em]">{c.code}</span>
              <CopyButton value={c.code} label={t("promo.editor.code.copy")} copiedLabel={t("promo.editor.code.copied")} onCopied={() => showToast(t("promo.toast.codeCopied"), c.code, "info")} />
            </div>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {c.caseSensitive ? t("promo.editor.code.caseSensitiveOn") : t("promo.detail.caseInsensitive")}
              {" · "}
              {c.kind === "unique" ? t("promo.detail.uniqueCodes", { count: c.uniqueCount ?? 0 }) : t("promo.editor.code.shared")}
            </p>
          </div>
        ) : (
          <p className="m-0 text-[length:var(--text-body-sm)] font-medium text-[var(--status-error-fg)]">{t("promo.validation.codeRequired")}</p>
        )}
      </Panel>

      <Panel title={t("promo.detail.campaign")} icon={Megaphone}>
        {campaign ? (
          <Link to={`/admin/promotions/campagnes/${campaign.id}`} className="group grid overflow-hidden rounded-[var(--admin-radius)] border border-[var(--border-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
            <CampaignCover theme={campaign.theme} cover={campaign.cover} title={l(campaign.title) || campaign.name} size="sm" />
            <span className="flex items-center justify-between gap-2 p-3">
              <span className="font-semibold text-[var(--text-primary)] group-hover:underline">{campaign.name}</span>
              <CampaignStatusBadge status={campaignStatus(campaign)} />
            </span>
          </Link>
        ) : (
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("promo.detail.standalone")}</p>
        )}
      </Panel>

      {product && (
        <Panel title={t("promo.detail.customerView")} icon={MonitorSmartphone} action={<Link to={`/admin/promotions/apercu?promotion=${promotion.id}`} className="text-[length:var(--text-caption)] font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">{t("promo.detail.openPreview")}</Link>}>
          <PreviewFrame label={t("promo.preview.productCard")}>
            <div className="mx-auto w-full max-w-[240px] p-3">
              <PreviewProductCard product={product} promotion={promotion} campaign={campaign} />
            </div>
          </PreviewFrame>
        </Panel>
      )}

      <Panel title={t("promo.detail.history")} icon={History}>
        <dl className="m-0 grid gap-3">
          <Fact label={t("promo.detail.created")} value={t("promo.detail.byOn", { name: promotion.createdBy, date: dateTime(promotion.createdAt) })} />
          <Fact label={t("promo.detail.updated")} value={t("promo.detail.byOn", { name: promotion.updatedBy, date: dateTime(promotion.updatedAt) })} />
          <Fact label={t("promo.detail.reference")} value={<CodeTag code={promotion.id} muted />} />
        </dl>
      </Panel>
    </aside>
  );
}
