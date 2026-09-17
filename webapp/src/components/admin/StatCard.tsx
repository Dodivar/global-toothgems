import { Link } from "react-router-dom";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * One operational number on the dashboard.
 *
 * Every card links somewhere: a count an administrator cannot act on is
 * decoration, and "12 out of stock" is only useful if it opens the twelve.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  to,
  linkLabel,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone?: "neutral" | "success" | "warning" | "error" | "brand";
  to: string;
  linkLabel: string;
}) {
  const toneClass = {
    neutral: "bg-[var(--surface-sunken)] text-[var(--text-body)]",
    brand: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
    success: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
    warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
    error: "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]",
  }[tone];

  return (
    <Link
      to={to}
      aria-label={linkLabel}
      className="gt-admin-panel group grid gap-3 p-5 transition-[border-color,box-shadow] hover:border-[var(--gt-ink-400)] hover:shadow-[var(--shadow-sm)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className={clsx("grid h-9 w-9 place-items-center rounded-[var(--admin-radius-sm)]", toneClass)}>
          <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
        </span>
        <ArrowUpRight
          size={15}
          aria-hidden="true"
          className="text-[var(--text-subtle)] transition-colors group-hover:text-[var(--text-primary)]"
        />
      </div>
      <div className="grid gap-0.5">
        <span className="text-[length:var(--text-h2)] font-bold leading-none tabular-nums text-[var(--text-primary)]">
          {value}
        </span>
        <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{label}</span>
        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</span>
      </div>
    </Link>
  );
}
