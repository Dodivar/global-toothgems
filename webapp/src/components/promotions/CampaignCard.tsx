import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Archive, CalendarRange, Copy, Eye, Package, Pause, Pencil, Play, Tag } from "lucide-react";
import { OverflowMenu, type MenuAction } from "../admin/OverflowMenu";
import { useLocalized } from "../../lib/localized";
import { campaignStatus, type Campaign, type CampaignLifecycle } from "../../data/adminPromotions";
import type { CampaignRollup } from "../../lib/promotionRules";
import { CampaignStatusBadge, useMoney, usePromoDates } from "./PromoBadges";
import { CampaignCover } from "./Visuals";

/**
 * One campaign in the grid. The banner is the campaign's identity — the same
 * artwork the storefront shows — and the numbers under it answer "is it
 * working?" without opening it. Every number is labelled in words; there is no
 * icon-only figure.
 */
export function CampaignCard({
  campaign,
  rollup,
  onLifecycle,
  onDuplicate,
}: {
  campaign: Campaign;
  rollup: CampaignRollup;
  onLifecycle: (c: Campaign, lifecycle: CampaignLifecycle) => void;
  onDuplicate: (c: Campaign) => void;
}) {
  const { t } = useTranslation();
  const l = useLocalized();
  const navigate = useNavigate();
  const money = useMoney();
  const { date } = usePromoDates();
  const status = campaignStatus(campaign);
  const href = `/admin/promotions/campagnes/${campaign.id}`;

  const actions: MenuAction[] = [
    { id: "view", label: t("promo.actions.view"), icon: Eye, onSelect: () => navigate(href) },
    { id: "edit", label: t("promo.campaigns.edit"), icon: Pencil, onSelect: () => navigate(`${href}/modifier`) },
    { id: "dup", label: t("promo.actions.duplicate"), icon: Copy, onSelect: () => onDuplicate(campaign) },
    ...(status === "active" || status === "scheduled"
      ? [{ id: "pause", label: t("promo.campaigns.pause"), icon: Pause, onSelect: () => onLifecycle(campaign, "paused") }]
      : []),
    ...(status === "paused" || status === "draft"
      ? [{ id: "live", label: t("promo.campaigns.activate"), icon: Play, onSelect: () => onLifecycle(campaign, "live") }]
      : []),
    ...(status !== "archived"
      ? [{ id: "archive", label: t("promo.actions.archive"), icon: Archive, onSelect: () => onLifecycle(campaign, "archived"), tone: "danger" as const, separated: true }]
      : []),
  ];

  return (
    <article className="gt-admin-panel group relative grid overflow-hidden transition-[box-shadow,transform] duration-[var(--duration-normal)] focus-within:shadow-[var(--shadow-md)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
      <CampaignCover theme={campaign.theme} cover={campaign.cover} title={l(campaign.title) || campaign.name} size="sm" className={status === "archived" ? "grayscale-[.6]" : undefined} />
      <div className="grid gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="grid min-w-0 gap-1">
            <h3 className="text-[length:var(--text-body-md)]">
              {/* The stretched link makes the whole card clickable while the
                  menu button keeps its own click (it sits above, z-10). */}
              <Link
                to={href}
                className="rounded-[2px] after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {campaign.name}
              </Link>
            </h3>
            <span className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              <CalendarRange size={13} aria-hidden="true" />
              {date(campaign.startsAt)} → {date(campaign.endsAt)}
            </span>
          </div>
          <span className="relative z-10 -mr-1 -mt-1">
            <OverflowMenu label={t("promo.actions.more", { name: campaign.name })} actions={actions} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CampaignStatusBadge status={status} />
          <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] text-[var(--text-body)]">
            <Tag size={12} aria-hidden="true" />
            {t("promo.campaigns.promotionCount", { count: rollup.promotions.length })}
          </span>
          <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] text-[var(--text-body)]">
            <Package size={12} aria-hidden="true" />
            {t("promo.campaigns.productCount", { count: campaign.productIds.length })}
          </span>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-3">
          <Stat label={t("promo.kpi.revenue")} value={money(rollup.revenueCents)} />
          <Stat label={t("promo.kpi.orders")} value={String(rollup.orders)} />
          <Stat label={t("promo.kpi.uses")} value={String(rollup.uses)} />
        </dl>
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">{label}</dt>
      <dd className="m-0 text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}
