import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BadgeEuro,
  CalendarClock,
  CircleCheck,
  Gift,
  History,
  LayoutList,
  Megaphone,
  MonitorSmartphone,
  Plus,
  ShoppingBag,
  TicketPercent,
} from "lucide-react";
import { AdminButton } from "../../components/admin/AdminButton";
import { AdminHeader } from "../../components/admin/AdminHeader";
import { OverflowMenu } from "../../components/admin/OverflowMenu";
import { usePromotions } from "../../lib/adminPromotions";
import { overview, PROMOTION_TABS, tabStatuses, type PromotionTab } from "../../lib/promotionRules";
import { promotionStatus } from "../../data/adminPromotions";
import { PromoKpi, PromoTabs, PrototypeBar, type TabItem } from "../../components/promotions/PromoUi";
import { useMoney } from "../../components/promotions/PromoBadges";
import { PromotionsListView } from "../../components/promotions/PromotionsListView";
import { CampaignsView } from "../../components/promotions/CampaignsView";
import { GiftCardsView } from "../../components/promotions/GiftCardsView";
import { useAdminShell } from "./AdminLayout";

/**
 * Promotions — the overview.
 *
 * Reads top to bottom as the questions an administrator arrives with: what is
 * live right now and what it is earning (the KPI row), then where to look
 * (the tabs), then the list itself. Campaigns and gift cards are tabs of the
 * same workspace rather than separate sections of the rail: a campaign is a
 * group of promotions and a gift card is sold alongside them, and one entry in
 * the navigation keeps the three in one mental place.
 *
 * The tab is part of the address (`?vue=campagnes`) so every view can be
 * linked to and "back" returns to it.
 */

/** URL slug per tab — French, like every admin route. */
export const TAB_SLUG: Record<PromotionTab, string> = {
  all: "",
  active: "actives",
  scheduled: "programmees",
  expired: "expirees",
  campaigns: "campagnes",
  giftCards: "cartes-cadeaux",
};

export function promotionsHref(tab: PromotionTab): string {
  return TAB_SLUG[tab] ? `/admin/promotions?vue=${TAB_SLUG[tab]}` : "/admin/promotions";
}

const TAB_ICON = {
  all: LayoutList,
  active: CircleCheck,
  scheduled: CalendarClock,
  expired: History,
  campaigns: Megaphone,
  giftCards: Gift,
} as const;

export function Promotions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { openNav } = useAdminShell();
  const [params] = useSearchParams();
  const { promotions, campaigns, giftCards, loading } = usePromotions();
  const money = useMoney();

  const slug = params.get("vue") ?? "";
  const tab = (PROMOTION_TABS.find((id) => TAB_SLUG[id] === slug) ?? "all") as PromotionTab;
  const kpi = useMemo(() => overview(promotions, campaigns, giftCards), [promotions, campaigns, giftCards]);

  // Revenue per day across every promotion, for the revenue tile's sparkline.
  const trend = useMemo(() => {
    const sum = Array.from({ length: 14 }, () => 0);
    promotions.forEach((p) => p.stats.daily.forEach((v, i) => (sum[i] += v)));
    return sum;
  }, [promotions]);

  const counts: Partial<Record<PromotionTab, number>> = {
    all: promotions.filter((p) => promotionStatus(p) !== "archived").length,
    active: promotions.filter((p) => tabStatuses("active")!.includes(promotionStatus(p))).length,
    scheduled: promotions.filter((p) => tabStatuses("scheduled")!.includes(promotionStatus(p))).length,
    expired: promotions.filter((p) => tabStatuses("expired")!.includes(promotionStatus(p))).length,
    campaigns: campaigns.length,
    giftCards: giftCards.length,
  };

  const tabs: TabItem[] = PROMOTION_TABS.map((id) => ({
    id,
    label: t(`promo.tabs.${id}`),
    count: loading ? undefined : counts[id],
    icon: TAB_ICON[id],
    to: promotionsHref(id),
  }));

  return (
    <>
      <AdminHeader
        title={t("promo.header.title")}
        description={t("promo.header.description")}
        crumbs={[{ label: t("admin.nav.dashboard"), to: "/admin" }, { label: t("admin.nav.promotions") }]}
        onOpenNav={openNav}
        actions={
          <>
            <span><span className="hidden xl:inline-flex"><AdminButton
              variant="ghost"
              iconLeft={Gift}
              onClick={() => navigate(promotionsHref("giftCards"))}
            >
              {t("promo.header.giftCards")}
            </AdminButton></span></span>
            <span><span className="hidden sm:inline-flex"><AdminButton variant="outline" iconLeft={Megaphone} onClick={() => navigate("/admin/promotions/campagnes/nouvelle")}>
              {t("promo.header.createCampaign")}
            </AdminButton></span></span>
            <AdminButton variant="primary" iconLeft={Plus} onClick={() => navigate("/admin/promotions/nouvelle")}>
              <span className="hidden sm:inline">{t("promo.header.createPromotion")}</span>
              <span className="sm:hidden">{t("promo.header.createShort")}</span>
            </AdminButton>
            {/* On a phone the secondary actions fold into one menu, so the
                header keeps a single primary button and never overflows. */}
            <span className="sm:hidden">
              <OverflowMenu
                label={t("promo.header.moreActions")}
                actions={[
                  { id: "campaign", label: t("promo.header.createCampaign"), icon: Megaphone, onSelect: () => navigate("/admin/promotions/campagnes/nouvelle") },
                  { id: "cards", label: t("promo.header.giftCards"), icon: Gift, onSelect: () => navigate(promotionsHref("giftCards")) },
                  { id: "preview", label: t("promo.header.preview"), icon: MonitorSmartphone, onSelect: () => navigate("/admin/promotions/apercu") },
                ]}
              />
            </span>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-[var(--admin-gutter)] pb-[clamp(32px,5vw,56px)] pt-5">
        <PrototypeBar />

        <section aria-label={t("promo.kpi.label")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <PromoKpi loading={loading} icon={CircleCheck} tone="success" label={t("promo.kpi.active")} value={String(kpi.active)} hint={kpi.endingSoon ? t("promo.kpi.endingSoon", { count: kpi.endingSoon }) : t("promo.kpi.activeHint")} to={promotionsHref("active")} />
          <PromoKpi loading={loading} icon={CalendarClock} tone="brand" label={t("promo.kpi.scheduled")} value={String(kpi.scheduled)} hint={t("promo.kpi.scheduledHint")} to={promotionsHref("scheduled")} />
          <PromoKpi loading={loading} icon={Megaphone} tone="highlight" label={t("promo.kpi.campaigns")} value={String(kpi.activeCampaigns)} hint={t("promo.kpi.campaignsHint", { count: campaigns.length })} to={promotionsHref("campaigns")} />
          <PromoKpi loading={loading} icon={BadgeEuro} tone="success" label={t("promo.kpi.revenueLabel")} value={money(kpi.revenueCents)} hint={t("promo.kpi.revenueHint")} trend={trend.some((v) => v > 0) ? trend : undefined} />
          <PromoKpi loading={loading} icon={ShoppingBag} tone="neutral" label={t("promo.kpi.ordersLabel")} value={String(kpi.orders)} hint={t("promo.kpi.ordersHint")} />
          <PromoKpi loading={loading} icon={TicketPercent} tone="highlight" label={t("promo.kpi.giftCardRevenue")} value={money(kpi.giftCardRevenueCents)} hint={t("promo.kpi.giftCardHint", { count: kpi.giftCardsSold })} to={promotionsHref("giftCards")} />
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="min-w-0 flex-1">
              <PromoTabs items={tabs} current={tab} label={t("promo.tabs.label")} />
            </div>
          </div>

          {/* Keyed on the tab so selection and local filters never leak between views. */}
          <div key={tab}>
            {tab === "campaigns" ? <CampaignsView /> : tab === "giftCards" ? <GiftCardsView /> : <PromotionsListView tab={tab} />}
          </div>

          <p className="m-0 flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <MonitorSmartphone size={14} aria-hidden="true" />
            {t("promo.previewLink.text")}
            <button
              type="button"
              onClick={() => navigate("/admin/promotions/apercu")}
              className="rounded-[2px] font-semibold text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--accent-highlight-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {t("promo.previewLink.action")}
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
