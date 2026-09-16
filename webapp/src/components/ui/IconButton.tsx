import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export type IconButtonVariant = "ghost" | "solid" | "outline" | "glass";
export type IconButtonSize = "sm" | "md" | "lg";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  badge?: number | string;
}

const dims: Record<IconButtonSize, number> = { sm: 32, md: 40, lg: 48 };

const variantClasses: Record<IconButtonVariant, string> = {
  ghost: "bg-transparent text-[var(--text-primary)] border border-transparent hover:bg-[var(--gt-ink-100)]",
  solid: "bg-[var(--surface-inverse)] text-[var(--text-inverse)] border border-transparent hover:bg-[var(--gt-ink-700)]",
  outline: "bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--gt-ink-100)]",
  glass: "gt-glass text-[var(--text-primary)] hover:bg-white/85",
};

export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  size = "md",
  badge,
  className,
  disabled,
  ...rest
}: IconButtonProps) {
  const d = dims[size];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={clsx(
        "relative inline-flex items-center justify-center rounded-[var(--radius-pill)] transition-colors duration-[var(--duration-fast)] active:scale-[0.96] disabled:opacity-45 disabled:pointer-events-none",
        variantClasses[variant],
        className,
      )}
      style={{ width: d, height: d }}
      {...rest}
    >
      <Icon size={Math.round(d * 0.45)} strokeWidth={1.75} />
      {badge != null && badge !== 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-[var(--radius-pill)] px-[5px] text-[10px] font-bold text-white"
          style={{ background: "var(--accent-highlight)" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
