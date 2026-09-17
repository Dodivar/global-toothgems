import { useTranslation } from "react-i18next";
import { BellRing, Hourglass, Layers, PackageCheck, PackageOpen, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { OrderMetrics } from "../../lib/adminOrderFilters";

/**
 * The order situation at a glance, and the fastest way into a queue.
 *
 * Each tile is a real control: pressing "Pending" filters the table to pending
 * orders, pressing it again clears it. That is why the figures are counted from
 * the same array the table renders — a KPI that cannot be acted on is a
 * decoration, and one that disagrees with the rows below it is a bug.
 *
 * Deliberately short: `--space-3` of padding and a 22px figure. The brief asks
 * for the vertical space to go to the order list, and six tall cards would push
 * the first row of the table under the fold on a laptop.
 */

interface Tile {
  key: string;
  labelKey: string;
  value: number;
  icon: LucideIcon;
  /** Status values this tile stands for, or `attention` for the flag. */
  statuses?: string[];
  attention?: boolean;
  accent: string;
}

export function MetricsRow({
  metrics,
  activeStatuses,
  attentionActive,
  /** Number of filters of any kind in force, including the search term. */
  activeFilters,
  onSelectStatuses,
  onToggleAttention,
  onClear,
}: {
  metrics: OrderMetrics;
  activeStatuses: string[];
  attentionActive: boolean;
  activeFilters: number;
  onSelectStatuses: (statuses: string[]) => void;
  onToggleAttention: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();

  const tiles: Tile[] = [
    { key: "total", labelKey: "admin.orders.kpiTotal", value: metrics.total, icon: Layers, accent: "var(--gt-ink-900)" },
    { key: "pending", labelKey: "admin.orders.kpiPending", value: metrics.pending, icon: Hourglass, statuses: ["pending"], accent: "var(--gt-amber-600)" },
    { key: "processing", labelKey: "admin.orders.kpiProcessing", value: metrics.processing, icon: PackageOpen, statuses: ["confirmed", "processing"], accent: "var(--gt-blue-700)" },
    { key: "shipped", labelKey: "admin.orders.kpiShipped", value: metrics.shipped, icon: Truck, statuses: ["shipped"], accent: "var(--gt-blue-700)" },
    { key: "delivered", labelKey: "admin.orders.kpiDelivered", value: metrics.delivered, icon: PackageCheck, statuses: ["delivered"], accent: "var(--gt-emerald-600)" },
    { key: "attention", labelKey: "admin.orders.kpiAttention", value: metrics.attention, icon: BellRing, attention: true, accent: "var(--accent-highlight-ink)" },
  ];

  const isActive = (tile: Tile) => {
    // Not merely "no status chosen": pressing Total clears everything, so it
    // must not read as the current state while a search or a date range is on.
    if (tile.key === "total") return activeFilters === 0;
    if (tile.attention) return attentionActive;
    return tile.statuses!.length === activeStatuses.length && tile.statuses!.every((s) => activeStatuses.includes(s));
  };

  return (
    <ul
      aria-label={t("admin.orders.kpiLabel")}
      className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 xl:grid-cols-6"
    >
      {tiles.map((tile) => {
        const Icon = tile.icon;
        const active = isActive(tile);
        return (
          <li key={tile.key}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (tile.key === "total") onClear();
                else if (tile.attention) onToggleAttention();
                else onSelectStatuses(active ? [] : tile.statuses!);
              }}
              className={clsx(
                "group relative grid w-full gap-1 rounded-[var(--radius-md)] border p-3 text-left transition-[background-color,border-color,box-shadow] duration-[var(--duration-fast)]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                active
                  ? "border-[var(--gt-ink-900)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-sm)]",
              )}
            >
              {/* The tile's own colour lives on a hairline, not on a fill: six
                  filled cards would put six competing accents above the table. */}
              <span
                aria-hidden="true"
                className="absolute inset-x-3 top-0 h-[2px] rounded-b-[2px] opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: tile.accent, opacity: active ? 1 : undefined }}
              />
              {/* The figure comes first for a screen reader, which reads the
                  button's whole label in DOM order: "3, pending" beats
                  "pending, 3" when scanning six of these. */}
              <span className="sr-only">{`${tile.value} — ${t(tile.labelKey)}. ${active ? t("admin.orders.kpiActiveHint") : t("admin.orders.kpiFilterHint")}`}</span>
              <span
                aria-hidden="true"
                className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]"
              >
                <Icon size={13} style={{ color: tile.accent }} />
                <span className="truncate">{t(tile.labelKey)}</span>
              </span>
              <span
                aria-hidden="true"
                className="text-[22px] font-[var(--weight-black)] leading-none tabular-nums"
                style={{ color: tile.value === 0 ? "var(--text-subtle)" : "var(--text-primary)" }}
              >
                {tile.value}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
