import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Input({ label, id, className, ...rest }: InputProps) {
  const inputId = id ?? `field-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <label htmlFor={inputId} className="grid gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
        {label}
      </span>
      <input
        id={inputId}
        className={`h-11 rounded-[var(--radius-control)] border border-[var(--border-default)] bg-[var(--surface-card)] px-4 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-subtle)] focus:border-[var(--focus-ring)] ${className ?? ""}`}
        {...rest}
      />
    </label>
  );
}
