import { useTranslation } from "react-i18next";
import clsx from "clsx";

/**
 * A ranked list of anything, with the share drawn under the label.
 *
 * A bar in the row beats a separate chart for this kind of question: the eye
 * gets the ranking from the bar lengths and the exact figures from the columns
 * beside them, in one pass and in one place. It is also the shape that survives
 * a phone, which a map or a pie does not.
 *
 * One hue for every bar, deliberately. The rows are one series — countries,
 * courses — not five, so colouring them differently would spend the identity
 * channel on re-encoding what bar length already says.
 */

export interface RankedColumn {
  key: string;
  label: string;
  /** Rendered per row; already formatted. */
  value: (rowId: string) => string;
  /** Hidden below `sm`, for columns that are context rather than the point. */
  secondary?: boolean;
}

export interface RankedRow {
  id: string;
  label: string;
  sub?: string;
  /** 0–100. Drives the bar only; the columns carry the numbers. */
  share: number;
}

export function RankedTable({
  caption,
  rows,
  columns,
  color = "var(--gt-blue-700)",
  labelHeader,
}: {
  caption: string;
  rows: RankedRow[];
  columns: RankedColumn[];
  color?: string;
  labelHeader: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="gt-admin-scroll -mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[440px] border-collapse text-[length:var(--text-body-sm)]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[var(--border-subtle)]">
            <th scope="col" className="w-[44%] py-2 pr-3 text-left text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
              {labelHeader}
            </th>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={clsx(
                  "py-2 pl-3 text-right text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]",
                  column.secondary && "hidden sm:table-cell",
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id} className="gt-admin-row border-b border-[var(--border-subtle)] last:border-b-0">
              <th scope="row" className="py-2.5 pr-3 text-left font-medium align-top">
                <span className="flex items-baseline gap-2">
                  <span aria-hidden="true" className="w-4 flex-none text-[length:var(--text-caption)] tabular-nums text-[var(--text-subtle)]">
                    {index + 1}
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <span className="truncate text-[var(--text-primary)]">{row.label}</span>
                    {row.sub && (
                      <span className="truncate text-[length:var(--text-caption)] font-normal text-[var(--text-muted)]">
                        {row.sub}
                      </span>
                    )}
                    {/* The track is a lighter step of the bar's own hue, so an
                        empty row still reads as "this measure, near zero". */}
                    <span aria-hidden="true" className="mt-0.5 block h-1.5 w-full max-w-[220px] overflow-hidden rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)]">
                      <span
                        className="block h-full rounded-[var(--radius-pill)] transition-[width] duration-[var(--duration-normal)]"
                        style={{ width: `${Math.max(2, Math.min(100, row.share))}%`, background: color }}
                      />
                    </span>
                    <span className="sr-only">
                      {t("admin.stats.relativeShare", { share: Math.round(row.share) })}
                    </span>
                  </span>
                </span>
              </th>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={clsx(
                    "py-2.5 pl-3 text-right align-top tabular-nums text-[var(--text-body)]",
                    column.secondary && "hidden sm:table-cell",
                  )}
                >
                  {column.value(row.id)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
