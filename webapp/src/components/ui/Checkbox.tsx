import { Check } from "lucide-react";

interface CheckboxProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Checkbox({ label, description, checked, onChange }: CheckboxProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span
        className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-[6px] border transition-colors"
        style={{
          borderColor: checked ? "var(--gt-ink-900)" : "var(--border-default)",
          background: checked ? "var(--gt-ink-900)" : "transparent",
        }}
      >
        {checked && <Check size={13} strokeWidth={3} color="var(--gt-off-white)" />}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
        {description && <span className="text-xs text-[var(--text-muted)]">{description}</span>}
      </span>
    </label>
  );
}
