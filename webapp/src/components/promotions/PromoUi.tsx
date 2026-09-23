import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Copy,
  FlaskConical,
  Info,
  RotateCw,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../admin/AdminButton";
import { AdminPortal } from "../admin/AdminSheet";
import { Sparkline } from "../admin/stats/Sparkline";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { usePromotions, type PromoDemoMode } from "../../lib/adminPromotions";
import { PROMO_NOW } from "../../data/adminPromotions";
import { usePromoDates } from "./PromoBadges";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
  to: string;
}

/**
 * The workspace's section switcher.
 *
 * Tabs here are *views with addresses* — "Scheduled promotions" is something a
 * colleague links to — so they are links in a `<nav>` with `aria-current`,
 * not an ARIA tablist. The current tab is marked three ways: an ink underline,
 * bold weight and an inverted count, so it never depends on colour alone.
 * Horizontally scrollable on phones rather than wrapped onto two lines.
 */
export function PromoTabs({ items, current, label }: { items: TabItem[]; current: string; label: string }) {
  return (
    <nav aria-label={label} className="gt-scroller -mx-[var(--admin-gutter)] px-[var(--admin-gutter)]">
      <ul className="m-0 flex min-w-max list-none gap-1 border-b border-[var(--border-subtle)] p-0">
        {items.map((item) => {
          const active = item.id === current;
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <Link
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "relative inline-flex h-11 items-center gap-2 rounded-t-[var(--admin-radius-sm)] px-3.5 text-[length:var(--text-body-sm)] transition-colors",
                  focusRing,
                  active
                    ? "font-bold text-[var(--text-primary)]"
                    : "font-medium text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
                )}
              >
                {Icon && <Icon size={15} strokeWidth={1.9} aria-hidden="true" />}
                {item.label}
                {item.count != null && (
                  <span
                    className={clsx(
                      "grid h-5 min-w-5 place-items-center rounded-[var(--radius-pill)] px-1.5 text-[10px] font-bold tabular-nums",
                      active
                        ? "bg-[var(--gt-ink-900)] text-[var(--gt-white)]"
                        : "bg-[var(--gt-ink-100)] text-[var(--text-muted)]",
                    )}
                  >
                    {item.count}
                  </span>
                )}
                <span
                  aria-hidden="true"
                  className={clsx(
                    "absolute inset-x-2 -bottom-px h-[3px] rounded-t-[3px] bg-[var(--gt-ink-900)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
                    active ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/* KPI tile                                                                   */
/* -------------------------------------------------------------------------- */

export type KpiTone = "success" | "brand" | "highlight" | "neutral" | "warning";

const KPI_TONE: Record<KpiTone, string> = {
  success: "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]",
  brand: "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
  highlight: "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]",
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-body)]",
  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
};

/**
 * One number in the KPI row. Compact on purpose: six of them sit on one line
 * on a laptop and three on a tablet, so the label never wraps past two lines
 * and the hint says what the number is *of*.
 */
export function PromoKpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  to,
  trend,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  to?: string;
  trend?: number[];
  loading?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={clsx("grid h-8 w-8 flex-none place-items-center rounded-[var(--admin-radius-sm)]", KPI_TONE[tone])}>
          <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
        </span>
        {trend && !loading && <Sparkline values={trend} tone={tone === "success" ? "positive" : "neutral"} width={64} height={24} />}
      </div>
      <div className="grid gap-0.5">
        {loading ? (
          <span className="gt-skeleton mt-1 h-6 w-16 rounded-full" />
        ) : (
          <span className="text-[22px] font-bold leading-tight tabular-nums text-[var(--text-primary)]">{value}</span>
        )}
        <span className="text-[length:var(--text-caption)] font-semibold leading-snug text-[var(--text-primary)]">{label}</span>
        {hint && <span className="text-[11px] leading-snug text-[var(--text-muted)]">{hint}</span>}
      </div>
    </>
  );

  const cls = "gt-admin-panel grid content-between gap-3 p-4";
  if (!to) return <div className={cls}>{body}</div>;
  return (
    <Link
      to={to}
      className={clsx(
        cls,
        "transition-[border-color,box-shadow,transform] duration-[var(--duration-fast)] hover:-translate-y-px hover:border-[var(--gt-ink-400)] hover:shadow-[var(--shadow-sm)]",
        focusRing,
      )}
    >
      {body}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Dialogs                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A modal with a form inside — "Add to campaign", "Adjust balance".
 *
 * `ConfirmationDialog` covers yes/no; this covers "choose something, then
 * confirm". Same guarantees: focus moves in, Tab stays in, Escape closes, focus
 * returns; the confirming button is last in the DOM so a hurried Enter on the
 * first field never fires it. On phones it docks to the bottom edge as a sheet.
 */
export function FormDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  confirmDisabled,
  loading,
  tone = "default",
  icon: Icon,
  wide,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  confirmDisabled?: boolean;
  loading?: boolean;
  tone?: "default" | "danger" | "primary";
  icon?: LucideIcon;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <DialogFrame
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={onConfirm}
      onClose={onClose}
      confirmDisabled={confirmDisabled}
      loading={loading}
      tone={tone}
      icon={Icon}
      wide={wide}
    >
      {children}
    </DialogFrame>
  );
}

function DialogFrame({
  title,
  description,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onClose,
  confirmDisabled,
  loading,
  tone,
  icon: Icon,
  wide,
}: Omit<Parameters<typeof FormDialog>[0], "open">) {
  const ref = useFocusTrap<HTMLDivElement>(true, loading ? () => {} : onClose);
  const titleId = useId();
  const descId = useId();

  return (
    <AdminPortal>
      <div className="fixed inset-0 z-[400] grid items-end sm:place-items-center sm:p-4">
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={loading ? undefined : onClose}
          className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.42)]"
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descId : undefined}
          tabIndex={-1}
          className={clsx(
            "gt-sheet-up sm:gt-admin-dialog relative flex max-h-[92vh] w-full flex-col rounded-t-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] shadow-[var(--shadow-lg)] outline-none sm:rounded-[var(--admin-radius)]",
            wide ? "sm:max-w-[620px]" : "sm:max-w-[480px]",
          )}
        >
          <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--gt-ink-300)] sm:hidden" />
          <div className="flex items-start gap-3.5 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
            {Icon && (
              <span
                aria-hidden="true"
                className={clsx(
                  "grid h-10 w-10 flex-none place-items-center rounded-full",
                  tone === "danger"
                    ? "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]"
                    : tone === "primary"
                      ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                      : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
                )}
              >
                <Icon size={19} strokeWidth={2} />
              </span>
            )}
            <div className="grid min-w-0 flex-1 gap-1.5">
              <h2 id={titleId} className="text-[length:var(--text-h4)]">
                {title}
              </h2>
              {description && (
                <div id={descId} className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                  {description}
                </div>
              )}
            </div>
          </div>
          {children && <div className="gt-admin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">{children}</div>}
          <div className="flex flex-none flex-col-reverse gap-2 border-t border-[var(--border-subtle)] px-5 py-4 sm:flex-row sm:justify-end sm:border-t-0 sm:px-6 sm:pb-6 sm:pt-3">
            <AdminButton variant="outline" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </AdminButton>
            <AdminButton
              variant={tone === "danger" ? "danger" : tone === "primary" ? "primary" : "dark"}
              onClick={onConfirm}
              loading={loading}
              disabled={confirmDisabled}
            >
              {confirmLabel}
            </AdminButton>
          </div>
        </div>
      </div>
    </AdminPortal>
  );
}

/**
 * Bottom sheet for phones — the filters live here below `md`, so the list keeps
 * the whole screen and the controls come up from the edge the thumb is on.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
  footer,
  closeLabel,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
}) {
  const ref = useFocusTrap<HTMLDivElement>(open, onClose);
  const titleId = useId();
  if (!open) return null;
  return (
    <AdminPortal>
      <div className="fixed inset-0 z-[380]">
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={onClose}
          className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.38)]"
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="gt-sheet-up absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[var(--radius-xl)] bg-[var(--admin-panel)] shadow-[var(--shadow-lg)] outline-none"
        >
          <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--gt-ink-300)]" />
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
            <h2 id={titleId} className="text-[length:var(--text-h4)]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className={clsx(
                "grid h-9 w-9 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)]",
                focusRing,
              )}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="gt-admin-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && (
            <div className="flex flex-none gap-2 border-t border-[var(--border-subtle)] px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </div>
      </div>
    </AdminPortal>
  );
}

/* -------------------------------------------------------------------------- */
/* Form building blocks                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One lettered section of a long form. Collapsible so a returning
 * administrator can fold what is already settled; the header keeps a one-line
 * summary and a state marker (done / needs attention) visible when folded, so
 * collapsing never hides a problem.
 */
export function FormSection({
  id,
  letter,
  title,
  description,
  summary,
  state,
  defaultOpen = true,
  children,
  aside,
}: {
  id: string;
  letter: string;
  title: string;
  description?: string;
  summary?: string;
  state?: "ok" | "issue" | "neutral";
  defaultOpen?: boolean;
  children: ReactNode;
  aside?: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section id={id} aria-labelledby={`${panelId}-h`} className="gt-admin-panel scroll-mt-[calc(var(--admin-header-h)+64px)]">
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <span
          aria-hidden="true"
          className={clsx(
            "grid h-8 w-8 flex-none place-items-center rounded-full text-[length:var(--text-caption)] font-bold",
            state === "issue"
              ? "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]"
              : state === "ok"
                ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
          )}
        >
          {state === "ok" ? <Check size={15} strokeWidth={2.4} /> : state === "issue" ? <CircleAlert size={15} strokeWidth={2.2} /> : letter}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 id={`${panelId}-h`} className="text-[length:var(--text-h4)]">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen((v) => !v)}
              className={clsx("flex w-full items-center justify-between gap-3 rounded-[4px] text-left", focusRing)}
            >
              <span>
                <span className="sr-only">{letter}. </span>
                {title}
                {state === "issue" && <span className="sr-only"> — {t("promo.editor.sectionHasIssues")}</span>}
              </span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className={clsx(
                  "flex-none text-[var(--text-muted)] transition-transform duration-[var(--duration-normal)]",
                  open && "rotate-180",
                )}
              />
            </button>
          </h2>
          {description && open && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{description}</p>}
          {summary && !open && (
            <p className="m-0 truncate text-[length:var(--text-caption)] text-[var(--text-body)]">{summary}</p>
          )}
        </div>
        {aside}
      </div>
      <div id={panelId} className="gt-collapse" data-open={open}>
        <div>
          <div className="grid gap-5 border-t border-[var(--border-subtle)] p-4 sm:p-5">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Radio group drawn as a segmented control. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
  size = "md",
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
  size?: "sm" | "md";
}) {
  const name = useId();
  return (
    <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0">
      <legend className={clsx("mb-1.5 p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]", hideLabel && "sr-only")}>
        {label}
      </legend>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] p-1">
        {options.map((o) => {
          const checked = o.value === value;
          const Icon = o.icon;
          return (
            <label
              key={o.value}
              className={clsx(
                "relative inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] font-semibold transition-[background-color,color,box-shadow] duration-[var(--duration-fast)]",
                size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-[length:var(--text-caption)]",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus-ring)]",
                checked
                  ? "bg-[var(--admin-panel)] text-[var(--text-primary)] shadow-[var(--shadow-xs)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              {Icon && <Icon size={13} strokeWidth={2} aria-hidden="true" />}
              {o.label}
              {checked && <span className="sr-only"> ✓</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Checkbox with label and optional hint — the admin's plain boolean. */
export function CheckRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 h-[18px] w-[18px] flex-none accent-[var(--gt-ink-900)] disabled:cursor-not-allowed"
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** Text input with a unit on the right ("%", "€"). */
export function UnitInput({
  id,
  value,
  onChange,
  unit,
  placeholder,
  invalid,
  describedBy,
  inputMode = "decimal",
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="gt-admin-field pr-10 tabular-nums"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]"
      >
        {unit}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

/** Copy to clipboard with its own confirmation, independent of the toast. */
export function CopyButton({
  value,
  label,
  copiedLabel,
  size = "sm",
  variant = "outline",
  onCopied,
  iconOnly,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  size?: "sm" | "md";
  variant?: "outline" | "ghost" | "quiet";
  onCopied?: () => void;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(value);
    } catch {
      // Clipboard can be refused (insecure context, permissions); the visual
      // confirmation still shows the code was selected for copying.
    }
    setCopied(true);
    onCopied?.();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? copiedLabel : label}
        title={copied ? copiedLabel : label}
        className={clsx(
          "inline-grid h-7 w-7 place-items-center rounded-[6px] transition-colors",
          copied
            ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
            : "text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
          focusRing,
        )}
      >
        {copied ? <Check size={14} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        <span className="sr-only" aria-live="polite">
          {copied ? copiedLabel : ""}
        </span>
      </button>
    );
  }

  return (
    <AdminButton variant={variant} size={size} iconLeft={copied ? Check : Copy} onClick={copy} aria-live="polite">
      {copied ? copiedLabel : label}
    </AdminButton>
  );
}

const NOTICE_TONE = {
  info: { cls: "border-[var(--gt-blue-200)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]", icon: Info },
  warning: { cls: "border-[var(--gt-amber-400)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]", icon: TriangleAlert },
  error: { cls: "border-[var(--gt-red-400)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]", icon: CircleAlert },
  success: { cls: "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]", icon: CircleCheck },
} as const;

export function Notice({
  tone = "info",
  title,
  children,
  action,
  icon,
}: {
  tone?: keyof typeof NOTICE_TONE;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  const meta = NOTICE_TONE[tone];
  const Icon = icon ?? meta.icon;
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={clsx("flex flex-wrap items-start gap-3 rounded-[var(--admin-radius)] border p-3.5 sm:flex-nowrap", meta.cls)}
    >
      <Icon size={18} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="m-0 text-[length:var(--text-body-sm)] font-semibold">{title}</p>
        {children && <div className="text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-body)]">{children}</div>}
      </div>
      {action && <div className="flex-none">{action}</div>}
    </div>
  );
}

/** Usage against its limit. The text carries the numbers; the bar is support. */
export function UsageMeter({ used, max, label }: { used: number; max: number | null; label: string }) {
  const ratio = max ? Math.min(1, used / max) : null;
  return (
    <div className="grid min-w-[88px] gap-1">
      <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-primary)]">{label}</span>
      {ratio != null && (
        <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--gt-ink-100)]">
          <span
            className={clsx(
              "block h-full rounded-full transition-[width] duration-[var(--duration-slow)]",
              ratio >= 0.9 ? "bg-[var(--gt-amber-400)]" : "bg-[var(--gt-blue-500)]",
            )}
            style={{ width: `${Math.max(3, ratio * 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}

/** Loading failure with a way out. */
export function ErrorPanel({ title, body, onRetry, retryLabel }: { title: string; body: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div role="alert" className="gt-admin-panel grid justify-items-center gap-3 px-6 py-12 text-center">
      <span aria-hidden="true" className="grid h-12 w-12 place-items-center rounded-full bg-[var(--status-error-bg)] text-[var(--status-error-fg)]">
        <CircleAlert size={22} strokeWidth={1.9} />
      </span>
      <h3 className="text-[length:var(--text-h4)]">{title}</h3>
      <p className="m-0 max-w-[46ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{body}</p>
      <AdminButton variant="dark" iconLeft={RotateCw} onClick={onRetry}>
        {retryLabel}
      </AdminButton>
    </div>
  );
}

/**
 * Prototype controls. Visible and labelled as such — like the loyalty and
 * community demo switches — so a reviewer can reach the empty and error states
 * without anyone mistaking the switch for a product feature.
 */
export function PrototypeBar({ showModes = true }: { showModes?: boolean }) {
  const { t } = useTranslation();
  const { demoMode, setDemoMode } = usePromotions();
  const { dateLong } = usePromoDates();
  const modes: PromoDemoMode[] = ["live", "empty", "error"];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--admin-radius)] border border-dashed border-[var(--gt-blue-400)] bg-[var(--gt-blue-50)] px-3.5 py-2 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <FlaskConical size={14} aria-hidden="true" />
        {t("promo.proto.label")}
      </span>
      <span>{t("promo.proto.today", { date: dateLong(PROMO_NOW) })}</span>
      {showModes && (
        <div className="ml-auto">
          <Segmented
            label={t("promo.proto.simulate")}
            hideLabel
            size="sm"
            value={demoMode}
            onChange={setDemoMode}
            options={modes.map((m) => ({ value: m, label: t(`promo.proto.mode.${m}`) }))}
          />
        </div>
      )}
    </div>
  );
}

/** A labelled value on detail pages. */
export function Fact({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">{label}</dt>
      <dd
        className={clsx(
          "m-0 text-[length:var(--text-body-sm)] text-[var(--text-primary)]",
          mono && "font-[family-name:var(--gt-font-mono)] text-[length:var(--text-caption)] font-semibold",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** A detail-page panel: title row, optional action, content. */
export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className,
  id,
}: {
  title: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={clsx("gt-admin-panel grid content-start gap-4 p-4 sm:p-5", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[length:var(--text-body-md)]">
          {Icon && <Icon size={16} strokeWidth={1.9} aria-hidden="true" className="text-[var(--text-muted)]" />}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}
