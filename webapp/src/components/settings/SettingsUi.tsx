import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleCheck, CircleDashed, CircleHelp, Star, X, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { FormField } from "../admin/FormField";

/**
 * Building blocks shared by the four Settings sections.
 *
 * The admin already has its button, field, select, switch, sheet and dialog;
 * this file only adds what configuration screens need on top: a titled card
 * that groups related settings, a toggletip for the settings that need a
 * sentence of explanation, a status pill that never relies on colour, and a
 * quiet progress bar for translation coverage.
 */

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

export function SettingsCard({
  id,
  icon: Icon,
  title,
  description,
  actions,
  children,
  flush,
  className,
  tone = "blue",
}: {
  id?: string;
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Body without padding — for tables and lists that draw their own rows. */
  flush?: boolean;
  className?: string;
  tone?: "blue" | "emerald" | "fuchsia" | "ink";
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={clsx("gt-admin-panel scroll-mt-[calc(var(--admin-header-h)+24px)] overflow-hidden", className)}
    >
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 pb-4 pt-5 sm:px-6">
        {Icon && (
          <span
            aria-hidden="true"
            className={clsx(
              "grid h-10 w-10 flex-none place-items-center rounded-[10px]",
              tone === "blue" && "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
              tone === "emerald" && "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
              tone === "fuchsia" && "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]",
              tone === "ink" && "bg-[var(--gt-ink-900)] text-[var(--gt-white)]",
            )}
          >
            <Icon size={19} strokeWidth={1.8} />
          </span>
        )}
        <div className="grid min-w-[12rem] flex-1 gap-1">
          <h2 id={headingId} className="text-[length:var(--text-h4)] leading-[var(--leading-snug)]">
            {title}
          </h2>
          {description && (
            <p className="m-0 max-w-[68ch] text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={clsx(flush ? "border-t border-[var(--border-subtle)]" : "px-5 pb-6 sm:px-6")}>{children}</div>
    </section>
  );
}

/** Two columns from `md`, one below — the default rhythm of every form card. */
export function FieldGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("grid grid-cols-1 items-start gap-x-5 gap-y-4 md:grid-cols-2", className)}>{children}</div>;
}

/** A hairline between groups inside one card, with an optional small heading. */
export function SubHeading({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="grid gap-0.5 border-t border-[var(--border-subtle)] pt-5">
      <h3 className="text-[length:var(--text-body-sm)] font-bold text-[var(--text-primary)]">{children}</h3>
      {hint && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Text field                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `FormField` with a text input inside — the common case, written once.
 * The error only shows once `showError` is true (field left, or a save
 * attempted), so nobody is scolded for a field they have not reached yet.
 */
export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  showError = true,
  required,
  type = "text",
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
  counter,
  multiline,
  rows = 3,
  onBlur,
  aside,
  prefix,
  suffix,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  showError?: boolean;
  required?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "url" | "numeric" | "decimal";
  maxLength?: number;
  /** Shows "n / max" beside the label. */
  counter?: number;
  multiline?: boolean;
  rows?: number;
  onBlur?: () => void;
  aside?: ReactNode;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const over = counter != null && value.length > counter;
  return (
    <div className={className}>
      <FormField
        label={label}
        hint={hint}
        error={showError ? error : undefined}
        required={required}
        aside={
          aside ??
          (counter != null ? (
            <span
              className={clsx(
                "text-[11px] tabular-nums",
                over ? "font-semibold text-[var(--status-error-fg)]" : "text-[var(--text-subtle)]",
              )}
            >
              {value.length} / {counter}
            </span>
          ) : undefined)
        }
      >
        {(props) =>
          multiline ? (
            <textarea
              {...props}
              rows={rows}
              value={value}
              placeholder={placeholder}
              maxLength={maxLength}
              onBlur={onBlur}
              onChange={(e) => onChange(e.target.value)}
              className="gt-admin-field"
            />
          ) : (
            <div className="relative">
              {prefix && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]"
                >
                  {prefix}
                </span>
              )}
              <input
                {...props}
                type={type}
                value={value}
                placeholder={placeholder}
                autoComplete={autoComplete}
                inputMode={inputMode}
                maxLength={maxLength}
                onBlur={onBlur}
                onChange={(e) => onChange(e.target.value)}
                className={clsx("gt-admin-field", prefix && "pl-8", suffix && "pr-12", inputMode === "decimal" && "tabular-nums")}
              />
              {suffix && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]"
                >
                  {suffix}
                </span>
              )}
            </div>
          )
        }
      </FormField>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Toggletip                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A "?" that explains a setting.
 *
 * A toggletip rather than a hover tooltip: it opens on click or Enter, so it
 * works on touch and from the keyboard, and it stays open while it is read.
 * The explanation is announced through a live region when it opens. Escape or
 * a click elsewhere closes it.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={t("settings.ui.moreInfo", { topic: label })}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "grid h-6 w-6 place-items-center rounded-full text-[var(--text-subtle)] transition-colors hover:bg-[var(--gt-blue-100)] hover:text-[var(--gt-blue-700)]",
          open && "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
          focusRing,
        )}
      >
        <CircleHelp size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <span id={id} role="status" aria-live="polite" className="contents">
        {open && (
          <span className="gt-admin-dialog absolute left-1/2 top-[calc(100%+6px)] z-[70] w-[min(300px,80vw)] -translate-x-1/2 rounded-[var(--admin-radius-sm)] border border-[var(--gt-blue-200)] bg-[var(--admin-panel)] p-3.5 text-left text-[length:var(--text-caption)] font-normal normal-case leading-[var(--leading-normal)] tracking-normal text-[var(--text-body)] shadow-[var(--shadow-md)]">
            <span className="mb-1 flex items-start justify-between gap-2">
              <strong className="text-[var(--text-primary)]">{label}</strong>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("settings.ui.close")}
                className={clsx("-mr-1 -mt-1 grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)]", focusRing)}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </span>
            {children}
          </span>
        )}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

/** Active / inactive, with an icon and the word — never colour alone. */
export function StatusPill({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel?: string; inactiveLabel?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] border px-2 text-[11px] font-semibold",
        active
          ? "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
          : "border-[var(--border-default)] bg-[var(--surface-sunken)] text-[var(--text-muted)]",
      )}
    >
      {active ? <CircleCheck size={12} strokeWidth={2.2} aria-hidden="true" /> : <CircleDashed size={12} strokeWidth={2.2} aria-hidden="true" />}
      {active ? (activeLabel ?? t("settings.ui.active")) : (inactiveLabel ?? t("settings.ui.inactive"))}
    </span>
  );
}

/** The one default among several. Ink, with a star: the strongest neutral mark. */
export function DefaultBadge({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--gt-ink-900)] px-2 text-[11px] font-semibold text-[var(--gt-white)]">
      <Star size={11} strokeWidth={2.4} fill="currentColor" aria-hidden="true" />
      {label ?? t("settings.ui.default")}
    </span>
  );
}

/**
 * Compact on/off switch for a row — the row already names the thing, so the
 * visible text is the state and the accessible name is supplied.
 */
export function RowSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={clsx("relative inline-flex flex-none items-center", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="block h-5 w-9 rounded-[var(--radius-pill)] bg-[var(--gt-ink-300)] transition-colors duration-[var(--duration-fast)] peer-checked:bg-[var(--gt-emerald-500)] peer-disabled:opacity-45 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-[var(--gt-white)] shadow-[var(--shadow-xs)] transition-transform duration-[var(--duration-fast)] peer-checked:translate-x-4"
      />
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A thin coverage bar. The percentage is always printed next to it by the
 * caller; the bar is the at-a-glance support, so it is hidden from assistive
 * technology rather than announced as a second, identical number.
 */
export function CoverageBar({ percent, size = "md", className }: { percent: number; size?: "sm" | "md"; className?: string }) {
  const tone =
    percent >= 100
      ? "bg-[var(--gt-emerald-500)]"
      : percent >= 90
        ? "bg-[var(--gt-emerald-400)]"
        : percent >= 80
          ? "bg-[var(--gt-blue-500)]"
          : "bg-[var(--gt-amber-400)]";
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "block w-full overflow-hidden rounded-full bg-[var(--gt-ink-100)]",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
    >
      <span
        className={clsx("block h-full rounded-full transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out-soft)]", tone)}
        style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
      />
    </span>
  );
}

/** Flag glyph, decorative: always paired with the name or code in text. */
export function Flag({ glyph, className }: { glyph: string; className?: string }) {
  return (
    <span aria-hidden="true" className={clsx("inline-block leading-none", className)}>
      {glyph}
    </span>
  );
}

/** Small uppercase label used above values in summaries. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">{children}</span>
  );
}
