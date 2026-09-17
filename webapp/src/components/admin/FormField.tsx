import { useId, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";

/**
 * Label, helper text and error message around one control.
 *
 * The control is supplied through a render prop rather than cloned, so the
 * field owns the ids and every input in the admin is wired to its label,
 * description and error the same way. `aria-describedby` points at the hint,
 * the error, or both — a screen reader gets the same information the sighted
 * administrator reads under the field.
 */
interface FormFieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Renders beside the label: a character counter, a language switch. */
  aside?: ReactNode;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
    "aria-required": boolean | undefined;
  }) => ReactNode;
}

export function FormField({ label, hint, error, required, aside, children }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]"
        >
          {label}
          {required && (
            <span className="ml-1 text-[var(--accent-highlight-ink)]" aria-hidden="true">
              *
            </span>
          )}
        </label>
        {aside}
      </div>

      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })}

      {hint && !error && (
        <p id={hintId} className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className="m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]"
        >
          <CircleAlert size={13} strokeWidth={2} aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
