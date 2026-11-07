import type { ReactNode } from "react";
import { ArrowRight, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { Link } from "../../../lib/navigation";

/**
 * One card of the dashboard's "Your account" grid: an icon and a label, what
 * is true about the account right now, and where it leads.
 *
 * The whole card is the link when it has one destination (`to`), so a thumb
 * can hit it anywhere on a phone; the label of the action is still written at
 * the bottom, never conveyed by the hover alone. `tone="ink"` is the dark
 * dress for a card that asks for action (a reward ready to spend, a payment
 * to fix).
 */
export function DashboardTile({
  icon: Icon,
  eyebrow,
  to,
  cta,
  tone = "paper",
  footer,
  labelledBy,
  children,
}: {
  icon: LucideIcon;
  eyebrow: string;
  /** Destination of the whole card; omit when the footer carries its own links. */
  to?: string;
  /** Words of the card's action, shown at the bottom when `to` is set. */
  cta?: string;
  tone?: "paper" | "ink";
  /** Own controls at the bottom, for a card with more than one destination. */
  footer?: ReactNode;
  labelledBy: string;
  children: ReactNode;
}) {
  const ink = tone === "ink";
  const body = (
    <>
      <span
        className={clsx(
          "flex items-center gap-2 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)]",
          ink ? "text-[var(--gt-blue-300)]" : "text-[var(--text-muted)]",
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            "grid h-7 w-7 place-items-center rounded-[var(--radius-sm)]",
            ink ? "bg-white/10 text-[var(--gt-off-white)]" : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
          )}
        >
          <Icon size={15} />
        </span>
        {eyebrow}
      </span>
      <div className="grid flex-1 content-start gap-2">{children}</div>
      {to && cta && (
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-bold",
            ink ? "text-[var(--accent-cta)]" : "text-[var(--text-primary)]",
          )}
        >
          {cta}
          <ArrowRight size={15} aria-hidden="true" className="transition-transform duration-[var(--duration-fast)] group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      )}
      {footer}
    </>
  );

  const frame = clsx(
    "flex h-full flex-col gap-4 rounded-[var(--radius-card)] p-[var(--space-5)]",
    ink
      ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
      : "border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)]",
  );

  return (
    <li className="min-w-0">
      {to ? (
        <Link
          to={to}
          aria-labelledby={labelledBy}
          className={clsx(
            frame,
            "group no-underline transition-[box-shadow,border-color] duration-[var(--duration-fast)] hover:shadow-[var(--shadow-sm)] motion-reduce:transition-none",
            !ink && "hover:border-[var(--gt-blue-300)]",
          )}
        >
          {body}
        </Link>
      ) : (
        <section aria-labelledby={labelledBy} className={frame}>
          {body}
        </section>
      )}
    </li>
  );
}
