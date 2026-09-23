import { forwardRef, useId, type ReactNode } from "react";
import { Check, CircleAlert } from "lucide-react";
import clsx from "clsx";

/**
 * Consent checkbox.
 *
 * The shared `Checkbox` takes its label as a string, and the terms consent has
 * to contain two links. It also needs an error state — "accept the terms" is
 * the one validation on the last step — wired with `aria-invalid` and
 * `aria-describedby`, with an icon and sentence next to the red border.
 *
 * The links sit inside the label: activating a link inside a label follows the
 * link and does not toggle the box, so both remain usable.
 */
export const ConsentCheckbox = forwardRef<
  HTMLInputElement,
  {
    checked: boolean;
    onChange: (checked: boolean) => void;
    children: ReactNode;
    description?: ReactNode;
    error?: string | null;
    required?: boolean;
    id?: string;
  }
>(function ConsentCheckbox({ checked, onChange, children, description, error, required, id }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = `${inputId}-desc`;
  const errorId = `${inputId}-error`;

  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={inputId}
        className={clsx(
          "flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] p-2 -m-2 transition-colors hover:bg-[var(--gt-off-white)]",
        )}
      >
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={clsx(description && descId, errorId)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden="true"
          className={clsx(
            "mt-[1px] grid h-[22px] w-[22px] flex-none place-items-center rounded-[7px] border-[1.5px] transition-[background-color,border-color] duration-[var(--duration-fast)]",
            "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)] peer-focus-visible:shadow-[var(--shadow-focus)]",
            checked
              ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-white"
              : error
                ? "border-[var(--gt-red-500)] bg-[var(--status-error-bg)]"
                : "border-[var(--gt-ink-400)] bg-white",
          )}
        >
          {checked && <Check size={14} strokeWidth={3} className="gt-pop-in" />}
        </span>
        <span className="grid gap-1">
          <span className="text-[length:var(--text-body-sm)] leading-[1.5] text-[var(--text-primary)]">{children}</span>
          {description && (
            <span id={descId} className="text-[length:var(--text-caption)] leading-[1.45] text-[var(--text-muted)]">
              {description}
            </span>
          )}
        </span>
      </label>
      <div id={errorId} aria-live="polite" className="empty:hidden">
        {error && (
          <p className="gt-field-message m-0 flex items-start gap-1.5 pl-[34px] text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
            <CircleAlert size={14} aria-hidden="true" className="mt-[1px] flex-none" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
});
