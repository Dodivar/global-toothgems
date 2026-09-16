import { Check } from "lucide-react";

interface CheckboxProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ label, description, checked, onChange }: CheckboxProps) {
  return (
    <label className="group flex cursor-pointer items-start gap-3">
      {/* The real control is visually hidden, so its focus outline is invisible.
          It sits FIRST in the DOM so `peer-*` can style the box that follows it —
          without that ring a keyboard user cannot tell they have focused the
          checkbox that gates the submit button. */}
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-[6px] border transition-colors peer-focus-visible:shadow-[var(--shadow-focus)] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]"
        style={{
          borderColor: checked ? "var(--gt-ink-900)" : "var(--border-default)",
          background: checked ? "var(--gt-ink-900)" : "transparent",
        }}
      >
        {checked && <Check size={13} strokeWidth={3} color="var(--gt-off-white)" />}
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
        {description && <span className="text-xs text-[var(--text-muted)]">{description}</span>}
      </span>
    </label>
  );
}
