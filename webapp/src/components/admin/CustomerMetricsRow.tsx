import { useTranslation } from "react-i18next";
import { CircleCheck, GraduationCap, Repeat, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { CustomerMetrics } from "../../lib/adminCustomerFilters";

/**
 * The customer base at a glance, and the fastest way into a segment.
 *
 * Each tile is a real control, the way the orders KPI row is: pressing "Active"
 * filters the table to active accounts, pressing it again clears it. That is
 * also why the figures are counted from the same array the table renders —
 * suspending an account has to move "Active" while the operator is watching,
 * and a KPI that disagrees with the rows under it is a bug.
 *
 * The brief supplied example figures (2,486 customers, +184 this month). They
 * are not used: this prototype holds twenty-two customers, and a headline
 * claiming two thousand above a table showing twenty-two is the first thing
 * that makes an administrator stop trusting every other number on the screen.
 * The tiles show what the data says.
 *
 * "Repeat" is the one tile with a second figure, because the useful form of
 * that number is the share rather than the count — "8 · 36%" answers "is our
 * base loyal" in one glance, which the count alone does not.
 */

interface Tile {
  key: string;
  labelKey: string;
  value: string;
  /** Secondary line: a share, a proportion of the base. */
  hint?: string;
  icon: LucideIcon;
  accent: string;
  /** Which filter the tile stands for, if any. "total" clears everything. */
  filter: "total" | "new" | "active" | "training" | "repeat";
}

export function CustomerMetricsRow({
  metrics,
  activeFilters,
  activeStatuses,
  trainingActive,
  activityActive,
  dateActive,
  onSelectStatus,
  onToggleTraining,
  onToggleRepeat,
  onToggleNew,
  onClear,
}: {
  metrics: CustomerMetrics;
  /** Number of filters of any kind in force, including the search term. */
  activeFilters: number;
  activeStatuses: string[];
  trainingActive: boolean;
  activityActive: boolean;
  dateActive: boolean;
  onSelectStatus: (status: string) => void;
  onToggleTraining: () => void;
  onToggleRepeat: () => void;
  onToggleNew: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  const tiles: Tile[] = [
    {
      key: "total",
      labelKey: "admin.customers.kpiTotal",
      value: String(metrics.total),
      icon: Users,
      accent: "var(--gt-ink-900)",
      filter: "total",
    },
    {
      key: "new",
      labelKey: "admin.customers.kpiNew",
      value: `+${metrics.newThisMonth}`,
      hint: t("admin.customers.kpiNewHint"),
      icon: Sparkles,
      accent: "var(--accent-highlight-ink)",
      filter: "new",
    },
    {
      key: "active",
      labelKey: "admin.customers.kpiActive",
      value: String(metrics.active),
      hint: t("admin.customers.kpiShare", {
        percent: metrics.total === 0 ? 0 : Math.round((metrics.active / metrics.total) * 100),
      }),
      icon: CircleCheck,
      accent: "var(--gt-emerald-600)",
      filter: "active",
    },
    {
      key: "training",
      labelKey: "admin.customers.kpiTraining",
      value: String(metrics.withTraining),
      hint: t("admin.customers.kpiShare", {
        percent: metrics.total === 0 ? 0 : Math.round((metrics.withTraining / metrics.total) * 100),
      }),
      icon: GraduationCap,
      accent: "var(--gt-blue-700)",
      filter: "training",
    },
    {
      key: "repeat",
      labelKey: "admin.customers.kpiRepeat",
      value: `${metrics.repeatShare}%`,
      hint: t("admin.customers.kpiRepeatHint", { count: metrics.repeat }),
      icon: Repeat,
      accent: "var(--gt-amber-600)",
      filter: "repeat",
    },
  ];

  const isActive = (tile: Tile) => {
    switch (tile.filter) {
      // Not merely "no status chosen": pressing Total clears everything, so it
      // must not read as the current state while a search or a date range is on.
      case "total":
        return activeFilters === 0;
      case "active":
        return activeStatuses.length === 1 && activeStatuses[0] === "active";
      case "training":
        return trainingActive;
      case "repeat":
        return activityActive;
      case "new":
        return dateActive;
      default:
        return false;
    }
  };

  const press = (tile: Tile) => {
    switch (tile.filter) {
      case "total":
        return onClear();
      case "active":
        return onSelectStatus("active");
      case "training":
        return onToggleTraining();
      case "repeat":
        return onToggleRepeat();
      case "new":
        return onToggleNew();
    }
  };

  return (
    <ul
      aria-label={t("admin.customers.kpiLabel")}
      className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 xl:grid-cols-5"
    >
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const active = isActive(tile);
        return (
          <li key={tile.key}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => press(tile)}
              className={clsx(
                "group relative grid w-full gap-1 rounded-[var(--radius-md)] border p-3 text-left transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                active
                  ? "border-[var(--gt-ink-900)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-sm)]",
              )}
            >
              {/* The tile's own colour lives on a hairline, not on a fill: five
                  filled cards would put five competing accents above the table. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-3 top-0 h-[2px] rounded-b-[2px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: tile.accent, opacity: active ? 1 : undefined }}
              />
              {/* The figure comes first for a screen reader, which reads the
                  button's whole label in DOM order: "1,742, active customers"
                  beats "active customers, 1,742" when scanning five of these. */}
              <span className="sr-only">
                {`${tile.value} — ${t(tile.labelKey)}${tile.hint ? `, ${tile.hint}` : ""}. ${
                  active ? t("admin.customers.kpiActiveHint") : t("admin.customers.kpiFilterHint")
                }`}
              </span>
              <span
                aria-hidden="true"
                className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]"
              >
                <Icon size={13} style={{ color: tile.accent }} />
                <span className="truncate">{t(tile.labelKey)}</span>
              </span>
              <span
                aria-hidden="true"
                className="text-[22px] font-[var(--weight-black)] leading-none tabular-nums text-[var(--text-primary)]"
              >
                {tile.value}
              </span>
              {tile.hint && (
                <span aria-hidden="true" className="truncate text-[11px] text-[var(--text-subtle)]">
                  {tile.hint}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
