import type { ButtonHTMLAttributes, ReactNode } from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * The admin's button. Deliberately not the storefront `Button`: retail buttons
 * are pill-shaped, uppercase and 46px tall, which is the wrong density for a
 * toolbar sitting above a data table. Same palette, squarer geometry, sentence
 * case.
 */
export type AdminButtonVariant = "primary" | "dark" | "outline" | "ghost" | "danger" | "quiet";
export type AdminButtonSize = "sm" | "md";

interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

const variantClasses: Record<AdminButtonVariant, string> = {
  primary:
    "bg-[var(--accent-cta)] text-[var(--gt-ink-900)] border border-transparent hover:bg-[var(--accent-cta-hover)] active:bg-[var(--gt-emerald-400)]",
  dark:
    "bg-[var(--gt-ink-900)] text-[var(--text-inverse)] border border-transparent hover:bg-[var(--gt-ink-700)]",
  outline:
    "bg-[var(--admin-panel)] text-[var(--text-primary)] border border-[var(--border-default)] hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-ink-100)]",
  ghost:
    "bg-transparent text-[var(--text-body)] border border-transparent hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
  quiet:
    "bg-[var(--surface-sunken)] text-[var(--text-primary)] border border-transparent hover:bg-[var(--gt-ink-200)]",
  danger:
    "bg-[var(--gt-red-600)] text-[var(--gt-white)] border border-transparent hover:bg-[var(--gt-red-500)]",
};

const sizeClasses: Record<AdminButtonSize, string> = {
  sm: "h-8 px-3 text-[length:var(--text-caption)] gap-1.5",
  md: "h-[var(--admin-control-h)] px-4 text-[length:var(--text-body-sm)] gap-2",
};

const iconSize: Record<AdminButtonSize, number> = { sm: 14, md: 16 };

export function AdminButton({
  variant = "outline",
  size = "md",
  iconLeft: IconLeft,
  iconRight: IconRight,
  loading = false,
  fullWidth,
  className,
  children,
  disabled,
  ...rest
}: AdminButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "inline-flex items-center justify-center whitespace-nowrap rounded-[var(--admin-radius-sm)] font-semibold",
        "transition-[background-color,border-color,color] duration-[var(--duration-fast)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <LoaderCircle size={iconSize[size]} className="animate-spin" aria-hidden="true" />
      ) : (
        IconLeft && <IconLeft size={iconSize[size]} strokeWidth={2} aria-hidden="true" />
      )}
      {children}
      {!loading && IconRight && <IconRight size={iconSize[size]} strokeWidth={2} aria-hidden="true" />}
    </button>
  );
}
