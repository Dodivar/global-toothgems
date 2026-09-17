import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * Square icon control for table rows and panel headers. `label` is mandatory:
 * an icon-only button with no accessible name is invisible to a screen reader,
 * and these carry destructive actions.
 */
interface AdminIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  tone?: "default" | "danger";
  size?: "sm" | "md";
}

export function AdminIconButton({
  icon: Icon,
  label,
  tone = "default",
  size = "md",
  className,
  ...rest
}: AdminIconButtonProps) {
  const dim = size === "sm" ? "h-8 w-8" : "h-[var(--admin-control-h)] w-[var(--admin-control-h)]";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex items-center justify-center rounded-[var(--admin-radius-sm)] border border-transparent",
        "transition-colors duration-[var(--duration-fast)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
        tone === "danger"
          ? "text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
          : "text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
        dim,
        className,
      )}
      {...rest}
    >
      <Icon size={size === "sm" ? 15 : 17} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}
