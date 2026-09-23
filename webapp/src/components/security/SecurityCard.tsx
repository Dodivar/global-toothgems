import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * One section of the Security & privacy page: icon, title, a sentence of
 * context, an optional status badge, then the section's content.
 *
 * The account area's `Panel` with a header that can say where things stand.
 * `id` makes the card a target for the overview's links; `tabIndex={-1}` on
 * the heading lets those links move focus there, not just scroll.
 */
export function SecurityCard({
  id,
  icon: Icon,
  title,
  description,
  status,
  quiet = false,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  /** Lower-emphasis surface, for the destructive section. */
  quiet?: boolean;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={clsx(
        "grid scroll-mt-28 gap-5 rounded-[var(--radius-card)] border p-[var(--space-5)] sm:p-[var(--space-6)]",
        quiet
          ? "border-[var(--border-subtle)] bg-[var(--gt-off-white)]"
          : "border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)]",
      )}
    >
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span
          aria-hidden="true"
          className={clsx(
            "grid h-10 w-10 flex-none place-items-center rounded-[var(--radius-md)]",
            quiet ? "bg-[var(--gt-ink-100)] text-[var(--text-body)]" : "bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]",
          )}
        >
          <Icon size={18} strokeWidth={1.9} />
        </span>
        <div className="grid min-w-0 flex-1 basis-[240px] gap-1">
          <h2 id={headingId} tabIndex={-1} className="text-[length:var(--text-h4)] outline-none">
            {title}
          </h2>
          {description && <div className="text-[length:var(--text-body-sm)] text-[var(--text-muted)] [&_p]:m-0">{description}</div>}
        </div>
        {status && <div className="flex-none">{status}</div>}
      </header>
      {children}
    </section>
  );
}

/** Label/value line used inside the cards, e.g. "Current email — camille@…". */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] px-4 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{label}</dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{children}</dd>
    </div>
  );
}
