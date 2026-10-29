import type { ReactNode } from "react";
import type { Plus } from "lucide-react";

/**
 * Small pieces shared by the variant editors (`CustomVariantsEditor`,
 * `VariantOptionsEditor`).
 */

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

export function IconAction({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--admin-radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--admin-panel)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}
