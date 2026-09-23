import { useTranslation } from "react-i18next";
import { CircleCheck, PenLine, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { UserMetrics } from "../../lib/adminUserFilters";

/**
 * The team at a glance: four light tiles that also filter.
 *
 * The same behaviour as the customers KPI row, so it needs no learning: press
 * "Managers" to see the managers, press it again to clear. The figures are
 * counted from the list the table renders, so promoting someone moves the
 * Administrators tile while the operator watches.
 *
 * Each tile's colour is a two-pixel hairline, not a fill — four filled cards
 * would put four competing accents above the table the page exists for.
 */

type TileFilter = "total" | "active" | "manager" | "administrator";

interface Tile {
  key: TileFilter;
  labelKey: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  accent: string;
}

export function UserMetricsRow({
  metrics,
  activeFilters,
  roleFilter,
  statusFilter,
  onSelect,
}: {
  metrics: UserMetrics;
  activeFilters: number;
  roleFilter: string;
  statusFilter: string;
  onSelect: (tile: TileFilter) => void;
}) {
  const { t } = useTranslation();
  const share = (n: number) => (metrics.total === 0 ? 0 : Math.round((n / metrics.total) * 100));

  const tiles: Tile[] = [
    {
      key: "total",
      labelKey: "admin.users.kpiTotal",
      value: metrics.total,
      hint: t("admin.users.kpiInvited", { count: metrics.invited }),
      icon: Users,
      accent: "var(--gt-ink-900)",
    },
    {
      key: "active",
      labelKey: "admin.users.kpiActive",
      value: metrics.active,
      hint: t("admin.users.kpiShare", { percent: share(metrics.active) }),
      icon: CircleCheck,
      accent: "var(--gt-emerald-600)",
    },
    {
      key: "manager",
      labelKey: "admin.users.kpiManagers",
      value: metrics.managers,
      hint: t("admin.users.kpiShare", { percent: share(metrics.managers) }),
      icon: PenLine,
      accent: "var(--gt-blue-600)",
    },
    {
      key: "administrator",
      labelKey: "admin.users.kpiAdministrators",
      value: metrics.administrators,
      hint: t("admin.users.kpiAdminHint"),
      icon: ShieldCheck,
      accent: "var(--gt-ink-700)",
    },
  ];

  const isActive = (tile: TileFilter) => {
    switch (tile) {
      case "total":
        return activeFilters === 0;
      case "active":
        return statusFilter === "active" && activeFilters === 1;
      case "manager":
      case "administrator":
        return roleFilter === tile && activeFilters === 1;
    }
  };

  return (
    <ul aria-label={t("admin.users.kpiLabel")} className="m-0 grid list-none grid-cols-2 gap-2 p-0 lg:grid-cols-4">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const active = isActive(tile.key);
        return (
          <li key={tile.key}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(tile.key)}
              className={clsx(
                "group relative grid w-full gap-1 overflow-hidden rounded-[var(--radius-md)] border p-3.5 text-left transition-[border-color,box-shadow,transform] duration-[var(--duration-fast)]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                "motion-safe:hover:-translate-y-px",
                active
                  ? "border-[var(--gt-ink-900)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-sm)]",
              )}
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-3.5 top-0 h-[2px] rounded-b-[2px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: tile.accent, opacity: active ? 1 : undefined }}
              />
              <span className="sr-only">
                {`${tile.value} — ${t(tile.labelKey)}, ${tile.hint}. ${
                  active ? t("admin.users.kpiActiveHint") : t("admin.users.kpiFilterHint")
                }`}
              </span>
              <span aria-hidden="true" className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                <Icon size={13} style={{ color: tile.accent }} />
                <span className="truncate">{t(tile.labelKey)}</span>
              </span>
              <span
                aria-hidden="true"
                className="text-[24px] font-[var(--weight-black)] leading-none tabular-nums text-[var(--text-primary)]"
              >
                {tile.value}
              </span>
              <span aria-hidden="true" className="truncate text-[11px] text-[var(--text-muted)]">
                {tile.hint}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
