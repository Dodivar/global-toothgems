import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * A panel that slides in from the right edge, over the page.
 *
 * Used where the work is a side trip from a list — reading a user's profile,
 * adding or editing one — so the list stays in place behind it and closing the
 * panel returns the operator to the exact row they left.
 *
 * Modal behaviour is the one `useFocusTrap` gives the other admin overlays —
 * focus in on open, Tab kept inside, Escape to close, focus handed back — with
 * one addition: the panel steps aside while a dialog is open on top of it. A
 * role-change confirmation opened from the drawer must be the thing Escape
 * closes, not the drawer underneath it, so the panel only answers keys while it
 * is the topmost modal on the page.
 *
 * Rendered in a portal so it is never clipped or transformed by the page it
 * sits over, and so a dialog opened from inside it (also portalled) always
 * lands after it in the document — which is what "topmost" is measured by.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isTopmost(node: HTMLElement): boolean {
  const modals = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
  return modals[modals.length - 1] === node;
}

export function AdminSheet({
  open,
  onClose,
  title,
  description,
  closeLabel,
  headerExtra,
  children,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  closeLabel: string;
  /** Rendered under the title — the drawer's identity block, for instance. */
  headerExtra?: ReactNode;
  /** Laid out by the caller as a flex column: a scrolling body, then a footer. */
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  // Kept in a ref so a parent re-rendering with a new `onClose` does not tear
  // the trap down and send focus back to the trigger mid-edit.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // The trigger is recorded in a layout effect: those run before any passive
  // effect, including the one in which a form inside the sheet moves focus to
  // its first field — recording it later would remember that field instead.
  useLayoutEffect(() => {
    if (open) restoreTo.current = document.activeElement as HTMLElement | null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const first = node?.querySelector<HTMLElement>("[data-autofocus]") ?? node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!node || !isTopmost(node)) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!node.contains(document.activeElement)) {
        event.preventDefault();
        firstItem.focus();
      } else if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      // The trigger may have been removed meanwhile (a deleted user's row), in
      // which case focus falls back to the page's main landmark rather than
      // being dropped at the top of the document.
      const target = restoreTo.current;
      if (target && document.contains(target)) target.focus();
      else document.getElementById("main")?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="gt-admin fixed inset-0 z-[300]" style={{ background: "transparent" }}>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="gt-admin-scrim absolute inset-0 cursor-default bg-[rgba(17,17,17,.34)] backdrop-blur-[2px]"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className="gt-admin-drawer absolute inset-y-0 right-0 flex w-full flex-col border-l border-[var(--border-subtle)] bg-[var(--admin-panel)] shadow-[var(--shadow-lg)] outline-none"
      >
        <header className="flex-none border-b border-[var(--border-subtle)] px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <h2 id={titleId} className="text-[length:var(--text-h4)] leading-[var(--leading-snug)]">
                {title}
              </h2>
              {description && (
                <p id={descId} className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
              className="grid h-9 w-9 flex-none place-items-center rounded-[var(--admin-radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {headerExtra && <div className="mt-4">{headerExtra}</div>}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Renders overlays at the end of `<body>`, still inside the admin's token
 * scope. The admin's radii, control heights and panel colours are custom
 * properties set on `.gt-admin`, so a portal without this wrapper would lose
 * them; the wrapper's own page background is cancelled inline, because
 * `.gt-admin` is unlayered CSS and outranks a Tailwind utility.
 */
export function AdminPortal({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="gt-admin" style={{ background: "transparent" }}>
      {children}
    </div>,
    document.body,
  );
}

/** The sheet's scrolling body. */
export function SheetBody({ children }: { children: ReactNode }) {
  return <div className="gt-admin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>;
}

/** The sheet's pinned action row. */
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-none flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] px-5 py-3.5 sm:px-6">
      {children}
    </div>
  );
}
