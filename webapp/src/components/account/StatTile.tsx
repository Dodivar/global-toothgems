import type { LucideIcon } from "lucide-react";

/**
 * One summary figure. Rendered inside a `<dl>`, so the label is the term and
 * the number the definition; `flex-col-reverse` shows the figure first without
 * breaking that order in the DOM.
 */
export function StatTile({ value, label, icon: Icon }: { value: string; label: string; icon: LucideIcon }) {
  return (
    <div className="relative flex flex-col-reverse gap-1 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-xs)]">
      <Icon size={15} aria-hidden="true" className="absolute right-4 top-4 text-[var(--text-subtle)]" />
      <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 text-[26px] font-[var(--weight-black)] tabular-nums leading-none text-[var(--text-primary)]">
        {value}
      </dd>
    </div>
  );
}
