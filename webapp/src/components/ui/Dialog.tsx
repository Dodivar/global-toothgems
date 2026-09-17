import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";

/**
 * Modal dialog.
 *
 * The prototype needs three of these — export, refund, cancel — and the
 * accessibility work is the same every time: a labelled `role="dialog"`,
 * Escape to close, focus moved in on open and returned to the trigger on close,
 * and Tab kept inside while it is open. Hand-rolling that three times is how a
 * dialog ends up trapping a keyboard user, so it lives here once.
 *
 * Not `<dialog>`: `showModal()` cannot be driven from render state without an
 * effect that fights React, and its backdrop is not stylable with the design
 * system's glass tokens.
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export type DialogTone = "neutral" | "danger";

export function Dialog({
  open,
  onClose,
  title,
  description,
  tone = "neutral",
  icon,
  footer,
  children,
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  tone?: DialogTone;
  icon?: ReactNode;
  /** Action row. Laid out by the caller so destructive buttons can be separated. */
  footer?: ReactNode;
  children?: ReactNode;
  closeLabel: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  const focusables = useCallback(() => {
    const root = panel.current;
    if (!root) return [] as HTMLElement[];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  }, []);

  // Remember the trigger before the dialog steals focus, and hand it back on
  // close: without this, dismissing a row's confirmation drops the caret at the
  // top of the document and the table has to be navigated again from scratch.
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const first = focusables()[0] ?? panel.current;
    first?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, focusables]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, focusables]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
      {/* Decorative: the dialog is dismissed by Escape and by the labelled
          close button, so the scrim needs no role of its own. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-[rgba(17,17,17,.42)] backdrop-blur-[3px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={clsx(
          "gt-celebrate relative w-full max-w-[520px] rounded-t-[var(--radius-xl)] border bg-[var(--surface-card)] shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-lg)]",
          tone === "danger" ? "border-[var(--gt-red-400)]" : "border-[var(--border-subtle)]",
        )}
      >
        <header className="flex items-start gap-3 border-b border-[var(--border-subtle)] p-[var(--space-5)] pr-[var(--space-4)]">
          {icon && (
            <span
              aria-hidden="true"
              className={clsx(
                "mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-md)]",
                tone === "danger"
                  ? "bg-[var(--status-error-bg)] text-[var(--status-error-fg)]"
                  : "bg-[var(--surface-brand-wash)] text-[var(--gt-blue-700)]",
              )}
            >
              {icon}
            </span>
          )}
          <div className="grid min-w-0 flex-1 gap-1">
            <h2 id={titleId} className="text-[length:var(--text-h4)]">
              {title}
            </h2>
            {description && (
              <p id={descId} className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-pill)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        {children && <div className="grid gap-4 p-[var(--space-5)]">{children}</div>}

        {footer && (
          <footer className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-[var(--space-4)] px-[var(--space-5)]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
