import clsx from "clsx";
import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * A sortable column header of the back-office tables: one button that flips
 * between the column's ascending and descending sort, `aria-sort` on the cell.
 * `firstKey` is what the first press sorts by (newest first for dates);
 * `hint` is the screen-reader explanation of the button.
 */
export function SortableHead<K extends string>({
  label,
  ascKey,
  descKey,
  firstKey,
  sort,
  onSort,
  hint,
  className,
  align = "left",
}: {
  label: string;
  ascKey: K;
  descKey: K;
  firstKey?: K;
  sort: K;
  onSort: (sort: K) => void;
  hint: string;
  /** The table's header-cell classes. */
  className: string;
  align?: "left" | "right";
}) {
  const active = sort === ascKey || sort === descKey;
  const ascending = sort === ascKey;
  return (
    <th
      scope="col"
      className={clsx(className, align === "right" && "text-right")}
      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(active ? (ascending ? descKey : ascKey) : (firstKey ?? ascKey))}
        className={clsx(
          "inline-flex items-center gap-1 rounded-[var(--radius-xs)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          active && "text-[var(--text-primary)]",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        {active ? (
          ascending ? (
            <ArrowUp size={12} aria-hidden="true" />
          ) : (
            <ArrowDown size={12} aria-hidden="true" />
          )
        ) : (
          <ArrowDown size={12} aria-hidden="true" className="opacity-25" />
        )}
        <span className="sr-only">{hint}</span>
      </button>
    </th>
  );
}
