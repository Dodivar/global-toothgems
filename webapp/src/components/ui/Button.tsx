import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { LoaderCircle } from "lucide-react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "dark" | "brand" | "outline" | "ghost" | "glass" | "danger" | "dangerOutline";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  as?: "button" | "a";
  href?: string;
  children?: ReactNode;
}

/**
 * Phones get a tighter scale (the uppercase, tracked label reads large on a
 * narrow screen): `lg` is 48 px / 14 px text there and 56 px / 16 px from `sm`
 * up; `md` is 44 px / 13 px, then 46 px / 14 px. Every size keeps a 44 px touch
 * target except `sm`, which is for dense rows.
 */
const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-[length:var(--text-caption)] [&>svg]:size-3.5",
  md: "h-11 px-4 text-[13px] [&>svg]:size-4 sm:h-[46px] sm:px-[22px] sm:text-[length:var(--text-body-sm)]",
  lg: "h-12 px-5 text-[length:var(--text-body-sm)] [&>svg]:size-4 sm:h-14 sm:px-[30px] sm:text-[length:var(--text-body-md)] sm:[&>svg]:size-[18px]",
};

const iconSize: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent-cta)] text-[var(--text-on-accent)] border border-transparent hover:bg-[var(--accent-cta-hover)]",
  dark: "bg-[var(--surface-inverse)] text-[var(--text-inverse)] border border-transparent hover:bg-[var(--gt-ink-700)]",
  brand: "bg-[var(--surface-brand)] text-[var(--gt-ink-900)] border border-transparent hover:bg-[var(--gt-blue-200)]",
  outline: "bg-transparent text-[var(--text-primary)] border border-[var(--border-strong)] hover:bg-[var(--gt-ink-100)]",
  ghost: "bg-transparent text-[var(--text-primary)] border border-transparent hover:bg-[var(--gt-ink-100)]",
  glass: "gt-glass text-[var(--text-primary)] hover:bg-white/82",
  /* Destructive actions only. The outline form opens a confirmation; the solid
     form is the confirmation's final, irreversible button. */
  danger: "bg-[var(--gt-red-600)] text-white border border-transparent hover:bg-[#8c1227]",
  dangerOutline:
    "bg-transparent text-[var(--status-error-fg)] border border-[var(--gt-red-400)] hover:bg-[var(--status-error-bg)] hover:border-[var(--gt-red-600)]",
};

export function Button({
  variant = "primary",
  size = "md",
  iconLeft: IconLeft,
  iconRight: IconRight,
  loading = false,
  fullWidth,
  as = "button",
  href,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const Comp = as === "a" ? "a" : "button";
  const content = (
    <>
      {loading ? (
        <LoaderCircle size={iconSize[size]} className="animate-spin" />
      ) : (
        IconLeft && <IconLeft size={iconSize[size]} strokeWidth={2} />
      )}
      <span>{children}</span>
      {!loading && IconRight && <IconRight size={iconSize[size]} strokeWidth={2} />}
    </>
  );

  // On phones a long French label wraps onto a second line inside the same
  // height rather than widening its column past the screen.
  const cls = clsx(
    "inline-flex items-center justify-center gap-2 whitespace-normal text-center leading-[1.15] sm:whitespace-nowrap [&>svg]:flex-none rounded-[var(--radius-control)] font-semibold uppercase tracking-[var(--tracking-wide)] transition-[background-color,color,border-color,box-shadow] duration-[var(--duration-fast)] active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none",
    sizeClasses[size],
    variantClasses[variant],
    fullWidth ? "flex w-full" : "inline-flex",
    className,
  );

  if (Comp === "a") {
    return (
      <a href={href} className={cls} aria-disabled={disabled || loading} {...(rest as any)}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={cls} disabled={disabled || loading} aria-busy={loading} {...rest}>
      {content}
    </button>
  );
}
