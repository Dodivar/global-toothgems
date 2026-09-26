import type { LucideIcon } from "lucide-react";
import { formatPercent } from "../../../lib/adminAnalytics";
import { formatCount } from "../../../lib/format";

/**
 * A whole split into its parts, as one bar plus a list.
 *
 * The bar answers "what is the balance"; the list carries the figures. Segments
 * are separated by a gap in the surface colour rather than by a stroke — a
 * border would add ink that is not data, and at these widths two adjacent
 * segments of the same family would otherwise merge into one.
 *
 * Every segment that stands for a state carries an icon and its name, so the
 * meaning survives without the colour.
 */

export interface Segment {
  id: string;
  label: string;
  value: number;
  color: string;
  icon?: LucideIcon;
}

export function SplitBar({
  segments,
  total,
  barLabel,
}: {
  segments: Segment[];
  total: number;
  barLabel: string;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const share = (value: number) => (total > 0 ? (value / total) * 100 : 0);

  return (
    <div className="grid gap-3">
      <div
        role="img"
        aria-label={`${barLabel} ${visible
          .map((segment) => `${segment.label} ${formatCount(segment.value)}`)
          .join(", ")}`}
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-sunken)]"
      >
        {visible.map((segment, index) => (
          <span
            key={segment.id}
            className="h-full first:rounded-l-[var(--radius-pill)] last:rounded-r-[var(--radius-pill)]"
            style={{
              // Minimum width so a 1 % slice is still visible as a slice.
              width: `max(6px, ${share(segment.value).toFixed(2)}%)`,
              background: segment.color,
              zIndex: visible.length - index,
            }}
          />
        ))}
      </div>

      <ul className="m-0 grid list-none gap-2 p-0">
        {segments.map((segment) => (
          <li key={segment.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {segment.icon ? (
                <segment.icon size={14} strokeWidth={2} aria-hidden="true" style={{ color: segment.color }} className="flex-none" />
              ) : (
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 flex-none rounded-[3px]"
                  style={{ background: segment.color }}
                />
              )}
              <span className="truncate text-[length:var(--text-body-sm)] text-[var(--text-body)]">{segment.label}</span>
            </span>
            <span className="text-[length:var(--text-body-sm)] font-semibold tabular-nums text-[var(--text-primary)]">
              {formatCount(segment.value)}
            </span>
            <span className="w-14 text-right text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
              {formatPercent(Math.round(share(segment.value) * 10) / 10)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
