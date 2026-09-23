import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  ArrowDown,
  CircleAlert,
  Copy,
  Eye,
  LoaderCircle,
  MonitorSmartphone,
  Pause,
  Pencil,
  Play,
  RotateCcw,
} from "lucide-react";
import clsx from "clsx";
import { OverflowMenu, type MenuAction } from "../admin/OverflowMenu";
import { useLocalized } from "../../lib/localized";
import { COLLECTIONS, SEGMENTS, promotionStatus, type Promotion, type PromotionLifecycle } from "../../data/adminPromotions";
import { categoryById, type CategoryId } from "../../data/adminCatalog";
import { useAdminCatalog } from "../../lib/adminCatalog";
import { validatePromotion, type PromotionSort } from "../../lib/promotionRules";
import { CodeTag, DiscountChip, PromotionStatusBadge, PromotionTypeLabel, useDiscountLabel, usePromoDates } from "./PromoBadges";
import { UsageMeter } from "./PromoUi";

/**
 * The promotion list: a table from `lg`, cards below it.
 *
 * Ten columns do not fit beside the rail on a laptop, so the table scrolls
 * sideways inside its panel and the name column stays pinned — the row never
 * loses what it is while the operator reads across to "Usage". Below `lg` the
 * same rows are re-cut as cards with the discount, status and dates up front.
 *
 * A row is a link (the name) plus a mouse convenience (click anywhere); the
 * checkbox, the quick pause/activate and the "…" menu keep their own clicks.
 */

export interface PromotionListProps {
  promotions: Promotion[];
  selected: Set<string>;
  pending: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  sort: PromotionSort;
  onSort: (sort: PromotionSort) => void;
  campaignName: (id: string | null) => string;
  onLifecycle: (p: Promotion, lifecycle: PromotionLifecycle) => void;
  onDuplicate: (p: Promotion) => void;
  onArchive: (p: Promotion) => void;
}

const head =
  "border-b border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] whitespace-nowrap";

/** Where the promotion applies, in a few words. */
export function useScopeLabel() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { products } = useAdminCatalog();
  return (p: Promotion) => {
    const e = p.eligibility;
    const d = p.discount;
    if (d.type === "bundle")
      return (d.bundleProductIds ?? [])
        .map((id) => products.find((x) => x.id === id))
        .filter(Boolean)
        .map((x) => l(x!.name))
        .join(" + ");
    let scope: string;
    switch (e.scope) {
      case "all":
        scope = t("promo.scope.all");
        break;
      case "products":
        scope =
          e.productIds.length === 1
            ? l(products.find((x) => x.id === e.productIds[0])?.name ?? { fr: "—", en: "—" })
            : t("promo.scope.products", { count: e.productIds.length });
        break;
      case "categories":
        scope = e.categoryIds.map((id) => l(categoryById(id as CategoryId).name)).join(", ") || t("promo.scope.none");
        break;
      case "collections":
        scope = e.collectionIds.map((id) => l(COLLECTIONS.find((c) => c.id === id)?.name ?? { fr: id, en: id })).join(", ") || t("promo.scope.none");
        break;
    }
    if (e.customers === "new") return `${scope} · ${t("promo.customers.new")}`;
    if (e.customers === "existing") return `${scope} · ${t("promo.customers.existing")}`;
    if (e.customers === "segments")
      return `${scope} · ${e.segmentIds.map((id) => l(SEGMENTS.find((s) => s.id === id)?.name ?? { fr: id, en: id })).join(", ")}`;
    return scope;
  };
}

function useRowActions(props: PromotionListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (p: Promotion): MenuAction[] => {
    const status = promotionStatus(p);
    const canPause = status === "active" || status === "scheduled";
    const canActivate = status === "paused" || status === "draft";
    return [
      { id: "view", label: t("promo.actions.view"), icon: Eye, onSelect: () => navigate(`/admin/promotions/${p.id}`) },
      { id: "edit", label: t("promo.actions.edit"), icon: Pencil, onSelect: () => navigate(`/admin/promotions/${p.id}/modifier`) },
      ...(canPause ? [{ id: "pause", label: t("promo.actions.pause"), icon: Pause, onSelect: () => props.onLifecycle(p, "paused") }] : []),
      ...(canActivate
        ? [{ id: "activate", label: t("promo.actions.activate"), icon: Play, onSelect: () => props.onLifecycle(p, "live") }]
        : []),
      ...(status === "archived"
        ? [{ id: "restore", label: t("promo.actions.restore"), icon: RotateCcw, onSelect: () => props.onLifecycle(p, "draft") }]
        : []),
      { id: "duplicate", label: t("promo.actions.duplicate"), icon: Copy, onSelect: () => props.onDuplicate(p) },
      {
        id: "preview",
        label: t("promo.actions.preview"),
        icon: MonitorSmartphone,
        onSelect: () => navigate(`/admin/promotions/apercu?promotion=${p.id}`),
      },
      ...(status !== "archived"
        ? [{ id: "archive", label: t("promo.actions.archive"), icon: Archive, onSelect: () => props.onArchive(p), tone: "danger" as const, separated: true }]
        : []),
    ];
  };
}

/** The one-click toggle beside the menu: the action an operator reaches for most. */
function QuickToggle({ p, pending, onLifecycle }: { p: Promotion; pending: boolean; onLifecycle: PromotionListProps["onLifecycle"] }) {
  const { t } = useTranslation();
  const status = promotionStatus(p);
  const pause = status === "active" || status === "scheduled";
  const activate = status === "paused";
  if (!pause && !activate) return <span className="inline-block h-8 w-8" aria-hidden="true" />;
  const label = pause ? t("promo.actions.pauseNamed", { name: p.name }) : t("promo.actions.activateNamed", { name: p.name });
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => onLifecycle(p, pause ? "paused" : "live")}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-[var(--admin-radius-sm)] transition-colors disabled:cursor-wait",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        pause
          ? "text-[var(--text-muted)] hover:bg-[var(--status-warning-bg)] hover:text-[var(--status-warning-fg)]"
          : "text-[var(--text-muted)] hover:bg-[var(--status-success-bg)] hover:text-[var(--status-success-fg)]",
      )}
    >
      {pending ? (
        <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
      ) : pause ? (
        <Pause size={15} aria-hidden="true" />
      ) : (
        <Play size={15} aria-hidden="true" />
      )}
    </button>
  );
}

function usageLabel(p: Promotion, t: (key: string, o?: Record<string, unknown>) => string) {
  return p.usage.maxTotal ? t("promo.table.usesOf", { used: p.stats.uses, max: p.usage.maxTotal }) : t("promo.table.uses", { count: p.stats.uses });
}

export function PromotionsTable(props: PromotionListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const discount = useDiscountLabel();
  const scope = useScopeLabel();
  const { date } = usePromoDates();
  const actionsFor = useRowActions(props);
  const { promotions, selected, onToggle, onToggleAll, sort, onSort, campaignName, pending } = props;

  const allOn = promotions.length > 0 && promotions.every((p) => selected.has(p.id));
  const someOn = promotions.some((p) => selected.has(p.id));

  const sortHead = (label: string, key: PromotionSort, className?: string) => (
    <th scope="col" className={clsx(head, className)} aria-sort={sort === key ? "descending" : undefined}>
      <button
        type="button"
        onClick={() => onSort(key)}
        className={clsx(
          "inline-flex items-center gap-1 rounded-[3px] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]",
          sort === key ? "text-[var(--text-primary)]" : "hover:text-[var(--text-primary)]",
        )}
      >
        {label}
        <ArrowDown size={12} aria-hidden="true" className={sort === key ? "opacity-100" : "opacity-30"} />
      </button>
    </th>
  );

  return (
    <div className="gt-admin-panel hidden overflow-hidden lg:block">
      <div className="gt-admin-scroll overflow-x-auto">
        <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-[length:var(--text-body-sm)]">
          <caption className="sr-only">{t("promo.table.caption")}</caption>
          <thead>
            <tr>
              <th scope="col" className={clsx(head, "sticky left-0 z-[3] w-10 pl-4")}>
                <input
                  type="checkbox"
                  checked={allOn}
                  ref={(node) => {
                    if (node) node.indeterminate = !allOn && someOn;
                  }}
                  onChange={onToggleAll}
                  aria-label={t("promo.table.selectAll")}
                  className="h-4 w-4 accent-[var(--gt-ink-900)]"
                />
              </th>
              {sortHead(t("promo.table.promotion"), "name", "sticky left-10 z-[3] min-w-[230px] shadow-[inset_-1px_0_0_var(--border-subtle)]")}
              <th scope="col" className={clsx(head, "hidden 2xl:table-cell")}>{t("promo.table.type")}</th>
              <th scope="col" className={head}>{t("promo.table.discount")}</th>
              <th scope="col" className={head}>{t("promo.table.scope")}</th>
              <th scope="col" className={head}>{t("promo.table.campaign")}</th>
              {sortHead(t("promo.table.start"), "newest")}
              {sortHead(t("promo.table.end"), "expiration")}
              {sortHead(t("promo.table.usage"), "performance")}
              <th scope="col" className={head}>{t("promo.table.status")}</th>
              <th scope="col" className={clsx(head, "text-right")}>
                <span className="sr-only">{t("promo.table.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {promotions.map((p) => {
              const status = promotionStatus(p);
              const invalid = validatePromotion(p).length > 0;
              const isOn = selected.has(p.id);
              const cell = clsx("border-b border-[var(--border-subtle)] px-3 py-3 align-middle", isOn ? "bg-[var(--gt-blue-50)]" : "bg-[var(--admin-panel)] group-hover:bg-[var(--gt-blue-50)]");
              return (
                <tr
                  key={p.id}
                  className={clsx("group cursor-pointer", (status === "expired" || status === "archived") && "text-[var(--text-muted)]")}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button,input,label")) return;
                    navigate(`/admin/promotions/${p.id}`);
                  }}
                >
                  <td className={clsx(cell, "sticky left-0 z-[2] pl-4")}>
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => onToggle(p.id)}
                      aria-label={t("promo.table.select", { name: p.name })}
                      className="h-4 w-4 accent-[var(--gt-ink-900)]"
                    />
                  </td>
                  <td className={clsx(cell, "sticky left-10 z-[2] shadow-[inset_-1px_0_0_var(--border-subtle)]")}>
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
                      <Link
                        to={`/admin/promotions/${p.id}`}
                        className="w-fit rounded-[2px] font-semibold text-[var(--text-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        {p.name}
                      </Link>
                      <PromotionTypeLabel type={p.discount.type} className="2xl:hidden" />
                      <span className="flex flex-wrap items-center gap-1.5">
                        {p.code.mode === "code" ? (
                          p.code.code ? <CodeTag code={p.code.code} muted={status === "expired"} /> : null
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)]">{t("promo.code.automaticShort")}</span>
                        )}
                        {invalid && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--status-error-fg)]">
                            <CircleAlert size={12} aria-hidden="true" />
                            {t("promo.table.needsAttention")}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className={clsx(cell, "hidden 2xl:table-cell")}>
                    <PromotionTypeLabel type={p.discount.type} />
                  </td>
                  <td className={cell}>
                    <DiscountChip label={discount(p)} size="sm" />
                  </td>
                  <td className={clsx(cell, "max-w-[200px]")}>
                    <span className="line-clamp-2 text-[length:var(--text-caption)]">{scope(p)}</span>
                  </td>
                  <td className={cell}>
                    {p.campaignId ? (
                      <Link
                        to={`/admin/promotions/campagnes/${p.campaignId}`}
                        className="text-[length:var(--text-caption)] font-medium text-[var(--gt-blue-700)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                      >
                        {campaignName(p.campaignId)}
                      </Link>
                    ) : (
                      <span className="text-[length:var(--text-caption)] text-[var(--text-subtle)]">{t("promo.table.standalone")}</span>
                    )}
                  </td>
                  <td className={clsx(cell, "whitespace-nowrap text-[length:var(--text-caption)] tabular-nums")}>{date(p.schedule.startsAt)}</td>
                  <td className={clsx(cell, "whitespace-nowrap text-[length:var(--text-caption)] tabular-nums")}>
                    {p.schedule.endsAt ? date(p.schedule.endsAt) : <span className="text-[var(--text-subtle)]">{t("promo.timeline.noEnd")}</span>}
                  </td>
                  <td className={cell}>
                    <UsageMeter used={p.stats.uses} max={p.usage.maxTotal} label={usageLabel(p, t)} />
                  </td>
                  <td className={cell}>
                    <span key={status} className="gt-status-swap inline-block">
                      <PromotionStatusBadge status={status} />
                    </span>
                  </td>
                  <td className={clsx(cell, "text-right")}>
                    <span className="inline-flex items-center gap-0.5">
                      <QuickToggle p={p} pending={pending.has(p.id)} onLifecycle={props.onLifecycle} />
                      <OverflowMenu label={t("promo.actions.more", { name: p.name })} actions={actionsFor(p)} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PromotionCardList(props: PromotionListProps) {
  const { t } = useTranslation();
  const discount = useDiscountLabel();
  const scope = useScopeLabel();
  const { date } = usePromoDates();
  const actionsFor = useRowActions(props);
  const { promotions, selected, onToggle, campaignName, pending } = props;

  return (
    <ul className="m-0 grid list-none gap-2.5 p-0 lg:hidden">
      {promotions.map((p) => {
        const status = promotionStatus(p);
        const invalid = validatePromotion(p).length > 0;
        return (
          <li
            key={p.id}
            className={clsx("gt-admin-panel grid gap-3 p-4 transition-colors", selected.has(p.id) && "border-[var(--gt-blue-400)] bg-[var(--gt-blue-50)]")}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => onToggle(p.id)}
                aria-label={t("promo.table.select", { name: p.name })}
                className="mt-1 h-[18px] w-[18px] flex-none accent-[var(--gt-ink-900)]"
              />
              <div className="grid min-w-0 flex-1 gap-1">
                <Link
                  to={`/admin/promotions/${p.id}`}
                  className="rounded-[2px] font-semibold leading-snug text-[var(--text-primary)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  {p.name}
                </Link>
                <PromotionTypeLabel type={p.discount.type} />
              </div>
              <span className="flex flex-none items-center">
                <QuickToggle p={p} pending={pending.has(p.id)} onLifecycle={props.onLifecycle} />
                <OverflowMenu label={t("promo.actions.more", { name: p.name })} actions={actionsFor(p)} />
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DiscountChip label={discount(p)} size="sm" />
              <PromotionStatusBadge status={status} />
              {p.code.mode === "code" && p.code.code && <CodeTag code={p.code.code} />}
              {invalid && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--status-error-fg)]">
                  <CircleAlert size={12} aria-hidden="true" />
                  {t("promo.table.needsAttention")}
                </span>
              )}
            </div>
            <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-2 text-[length:var(--text-caption)]">
              <div className="col-span-2">
                <dt className="text-[var(--text-muted)]">{t("promo.table.scope")}</dt>
                <dd className="m-0 text-[var(--text-primary)]">{scope(p)}</dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">{t("promo.table.dates")}</dt>
                <dd className="m-0 text-[var(--text-primary)]">
                  {date(p.schedule.startsAt)} → {p.schedule.endsAt ? date(p.schedule.endsAt) : t("promo.timeline.noEnd")}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">{t("promo.table.campaign")}</dt>
                <dd className="m-0 text-[var(--text-primary)]">{p.campaignId ? campaignName(p.campaignId) : t("promo.table.standalone")}</dd>
              </div>
              <div className="col-span-2">
                <dt className="sr-only">{t("promo.table.usage")}</dt>
                <dd className="m-0">
                  <UsageMeter used={p.stats.uses} max={p.usage.maxTotal} label={usageLabel(p, t)} />
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

/** Skeleton rows shaped like the table. */
export function PromotionsSkeleton({ label }: { label: string }) {
  return (
    <div className="gt-admin-panel grid" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid grid-cols-[24px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_80px] items-center gap-4 border-b border-[var(--border-subtle)] px-4 py-4 last:border-b-0">
          <div className="gt-skeleton h-4 w-4 rounded" />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <div className="gt-skeleton h-3 w-2/3 rounded-full" />
            <div className="gt-skeleton h-2.5 w-1/3 rounded-full" />
          </div>
          <div className="gt-skeleton h-5 w-16 rounded-full" />
          <div className="gt-skeleton h-2.5 w-2/3 rounded-full" />
          <div className="gt-skeleton h-2.5 w-1/2 rounded-full" />
          <div className="gt-skeleton h-5 w-16 justify-self-end rounded-full" />
        </div>
      ))}
    </div>
  );
}
