import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "error" | "highlight" | "ink";
export type BadgeSize = "sm" | "md";

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[var(--gt-ink-100)] text-[var(--text-body)] border-[var(--border-subtle)]",
  brand: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)] border-[var(--gt-blue-200)]",
  success: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)] border-[var(--gt-emerald-300)]",
  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)] border-[var(--gt-amber-400)]",
  error: "bg-[var(--status-error-bg)] text-[var(--status-error-fg)] border-[var(--gt-red-400)]",
  highlight: "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)] border-[var(--gt-fuchsia-300)]",
  ink: "bg-[var(--surface-inverse)] text-[var(--text-inverse)] border-transparent",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "h-[22px] px-2 text-[10px] gap-1",
  md: "h-7 px-3 text-[length:var(--text-caption)] gap-1.5",
};

export function Badge({
  tone = "neutral",
  size = "md",
  icon: Icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center whitespace-nowrap rounded-[var(--radius-pill)] border font-semibold uppercase tracking-[var(--tracking-wide)]",
        toneClasses[tone],
        sizeClasses[size],
        className,
      )}
    >
      {Icon && <Icon size={size === "sm" ? 11 : 13} strokeWidth={2} />}
      {children}
    </span>
  );
}
