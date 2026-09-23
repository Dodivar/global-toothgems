import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, CircleAlert, Eye, EyeOff, LoaderCircle } from "lucide-react";
import clsx from "clsx";

/**
 * Form field for the registration journey.
 *
 * The storefront's `Input` is a bare label + input: fine for a prefilled
 * checkout, not for a form whose job is to explain itself. This one carries the
 * states the journey needs — hint, error, success, loading, disabled — and wires
 * them for assistive technology: the error and hint are referenced by
 * `aria-describedby`, `aria-invalid` flips with the error, and the message
 * region is a polite live region so an error that appears on blur is read out.
 *
 * State is never carried by colour alone: an error has an icon and a sentence,
 * success has a check and (optionally) a sentence, loading has a spinner and a
 * text alternative.
 */

export interface FieldState {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Shown as a check in the control, plus the message when given. */
  success?: boolean;
  successMessage?: string;
  loading?: boolean;
  loadingLabel?: string;
  optional?: boolean;
  /** Extra content below the message, e.g. a typo suggestion. */
  after?: ReactNode;
  /** Ids of other elements that describe the control. */
  describedBy?: string;
}

function FieldShell({
  id,
  label,
  optional,
  hint,
  hintId,
  error,
  errorId,
  success,
  successMessage,
  after,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  hintId: string;
  error?: string | null;
  errorId: string;
  success?: boolean;
  successMessage?: string;
  after?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="gt-field-label">
          {label}
        </label>
        {optional && (
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("register.optional")}</span>
        )}
      </div>
      {children}
      {hint && (
        <div id={hintId} className="text-[length:var(--text-caption)] leading-[1.45] text-[var(--text-muted)]">
          {hint}
        </div>
      )}
      {/* Always rendered so the live region exists before the first error. */}
      <div id={errorId} aria-live="polite" className="empty:hidden">
        {error ? (
          <p className="gt-field-message m-0 flex items-start gap-1.5 text-[length:var(--text-caption)] font-medium text-[var(--status-error-fg)]">
            <CircleAlert size={14} aria-hidden="true" className="mt-[1px] flex-none" />
            <span>{error}</span>
          </p>
        ) : success && successMessage ? (
          <p className="gt-field-message m-0 flex items-start gap-1.5 text-[length:var(--text-caption)] font-medium text-[var(--status-success-fg)]">
            <Check size={14} aria-hidden="true" className="mt-[1px] flex-none" />
            <span>{successMessage}</span>
          </p>
        ) : null}
      </div>
      {after}
    </div>
  );
}

function StatusIcon({ error, success, loading, loadingLabel }: Pick<FieldState, "error" | "success" | "loading" | "loadingLabel">) {
  if (loading) {
    return (
      <span className="grid h-6 w-6 place-items-center text-[var(--text-muted)]" role="status">
        <LoaderCircle size={17} aria-hidden="true" className="animate-spin" />
        <span className="sr-only">{loadingLabel}</span>
      </span>
    );
  }
  if (error) {
    return (
      <span aria-hidden="true" className="grid h-6 w-6 place-items-center text-[var(--status-error-fg)]">
        <CircleAlert size={17} />
      </span>
    );
  }
  if (success) {
    return (
      <span aria-hidden="true" className="gt-pop-in grid h-6 w-6 place-items-center rounded-full bg-[var(--status-success-bg)] text-[var(--status-success-fg)]">
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  return null;
}

type TextFieldProps = FieldState & Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & { id?: string };

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, success, successMessage, loading, loadingLabel, optional, after, describedBy, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-message`;
  const hasIcon = loading || !!error || success;

  return (
    <FieldShell
      id={inputId}
      label={label}
      optional={optional}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      success={success}
      successMessage={successMessage}
      after={after}
    >
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={clsx(hint && hintId, errorId, describedBy) || undefined}
          aria-required={optional ? undefined : true}
          data-valid={success && !error ? "true" : undefined}
          className={clsx("gt-field", hasIcon && "pr-12", className)}
          {...rest}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
          <StatusIcon error={error} success={success} loading={loading} loadingLabel={loadingLabel} />
        </span>
      </div>
    </FieldShell>
  );
});

/**
 * Password input with a show/hide toggle. The toggle is a real button with
 * `aria-pressed` and a label that says what it will do, and it sits outside the
 * tab order's surprise zone: after the input, before the rules.
 */
export const PasswordField = forwardRef<HTMLInputElement, TextFieldProps>(function PasswordField(
  { label, hint, error, success, successMessage, optional, after, describedBy, id, className, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-message`;
  const [visible, setVisible] = useState(false);

  return (
    <FieldShell
      id={inputId}
      label={label}
      optional={optional}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      success={success}
      successMessage={successMessage}
      after={after}
    >
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={clsx(hint && hintId, errorId, describedBy) || undefined}
          aria-required={optional ? undefined : true}
          data-valid={success && !error ? "true" : undefined}
          // Keeps password managers and mobile keyboards from "fixing" it.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={clsx("gt-field pr-[88px]", className)}
          {...rest}
        />
        <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <span className="pointer-events-none">
            <StatusIcon error={error} success={success} />
          </span>
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-controls={inputId}
            aria-label={t(visible ? "register.hidePassword" : "register.showPassword")}
            className="grid h-10 w-10 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]"
          >
            {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </span>
      </div>
    </FieldShell>
  );
});

type SelectFieldProps = FieldState &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
    id?: string;
    placeholder: string;
    options: { value: string; label: string }[];
  };

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, success, successMessage, optional, after, describedBy, id, placeholder, options, className, value, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-message`;

  return (
    <FieldShell
      id={inputId}
      label={label}
      optional={optional}
      hint={hint}
      hintId={hintId}
      error={error}
      errorId={errorId}
      success={success}
      successMessage={successMessage}
      after={after}
    >
      <div className="relative">
        <select
          ref={ref}
          id={inputId}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={clsx(hint && hintId, errorId, describedBy) || undefined}
          aria-required={optional ? undefined : true}
          data-valid={success && !error ? "true" : undefined}
          data-empty={!value ? "true" : undefined}
          className={clsx("gt-field appearance-none pr-20", className)}
          {...rest}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
          <StatusIcon error={error} success={success} />
          <ChevronDown size={16} aria-hidden="true" className="text-[var(--text-muted)]" />
        </span>
      </div>
    </FieldShell>
  );
});
