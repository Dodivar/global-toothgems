import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * The heading of one dashboard section. Every member route renders exactly one,
 * which is why the title is the page's `<h1>`: the section is the page now that
 * the member area is split across routes rather than scrolled through.
 */
export function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
}: {
  icon?: LucideIcon;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-2">
        <span className="gt-eyebrow flex items-center gap-2">
          {Icon && <Icon size={13} aria-hidden="true" />}
          {eyebrow}
        </span>
        <h1 className="text-[length:var(--text-h2)]">{title}</h1>
        {description && (
          <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {description}
          </p>
        )}
      </div>
      {actions}
    </header>
  );
}

/** Shared empty state: a dashed panel with an optional call to action. */
export function EmptyPanel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-6)]">
      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{children}</p>
      {action}
    </div>
  );
}

/** A titled card, the dashboard's basic container for grouped fields. */
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]">
      <h2 className="text-[length:var(--text-h4)]">{title}</h2>
      {children}
    </section>
  );
}
