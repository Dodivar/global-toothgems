import { useId } from "react";

/**
 * On/off switch for a single setting.
 *
 * A real `<input type="checkbox">` under a painted track: the platform gives
 * the role, the state and space-bar activation, and `peer-*` styles the track
 * from the input's own focus and checked states, so the focus ring lands on
 * what the eye reads as the control.
 */
interface ToggleSwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleSwitch({ label, description, checked, onChange, disabled }: ToggleSwitchProps) {
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {label}
        </label>
        {description && (
          <p id={descId} className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {description}
          </p>
        )}
      </div>

      <span className="relative inline-flex flex-none items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          aria-describedby={descId}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="block h-6 w-11 cursor-pointer rounded-[var(--radius-pill)] bg-[var(--gt-ink-300)] transition-colors duration-[var(--duration-fast)] peer-checked:bg-[var(--gt-emerald-500)] peer-disabled:cursor-not-allowed peer-disabled:opacity-45 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--gt-white)] shadow-[var(--shadow-xs)] transition-transform duration-[var(--duration-fast)] peer-checked:translate-x-5"
        />
      </span>
    </div>
  );
}
