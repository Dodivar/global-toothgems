import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import clsx from "clsx";

/**
 * A panel anchored under a toolbar button, for the editor's Presets and Export
 * menus.
 *
 * Same behaviour and look as `ui/Menu` — Escape closes and returns focus to
 * the trigger, a press outside dismisses — but controlled from outside, because
 * these panels hold small forms (a preset name, a client name) whose own
 * buttons must close the panel once they have acted.
 */
export function EditorPopover({
  label,
  open,
  onOpenChange,
  trigger,
  children,
  width = 300,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Renders the trigger. `props` must be spread onto a real `<button>`. */
  trigger: (props: {
    ref: (node: HTMLButtonElement | null) => void;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "dialog";
    "aria-controls": string;
  }) => ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();
  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Handled here, so the editor's own Escape (deselect) does not also run.
      event.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("pointerdown", onPointerDown);
    wrap.current?.addEventListener("keydown", onKeyDown);
    const node = wrap.current;
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      node?.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrap} className="relative inline-flex">
      {trigger({
        ref: setTriggerRef,
        onClick: () => onOpenChange(!open),
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        "aria-controls": panelId,
      })}
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          style={{ width: `min(${width}px, calc(100vw - 24px))` }}
          className={clsx(
            "absolute right-0 top-[calc(100%+8px)] z-50 grid max-h-[min(70vh,560px)] origin-top overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-md)]",
            "motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Small uppercase heading inside a popover or panel. */
export function PopoverLabel({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
      {children}
    </p>
  );
}

export function PopoverSeparator() {
  return <span role="none" className="mx-1 my-1.5 block h-px bg-[var(--border-subtle)]" />;
}

/** One action row: icon, label and an optional second line. */
export function PopoverItem({
  icon,
  label,
  sub,
  onClick,
  destructive,
}: {
  icon: ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex w-full min-w-0 items-start gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[length:var(--text-body-sm)] font-semibold transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        destructive
          ? "text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
          : "text-[var(--text-primary)] hover:bg-[var(--surface-brand-wash)]",
      )}
    >
      <span aria-hidden="true" className={clsx("mt-0.5 flex-none", destructive ? "" : "text-[var(--gt-blue-600)]")}>
        {icon}
      </span>
      <span className="grid min-w-0">
        <span className="truncate">{label}</span>
        {sub && <span className="text-[11.5px] font-medium leading-snug text-[var(--text-muted)]">{sub}</span>}
      </span>
    </button>
  );
}
