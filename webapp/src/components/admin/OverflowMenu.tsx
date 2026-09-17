import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import clsx from "clsx";

export interface MenuAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Draws a rule above this entry, to keep destructive actions apart. */
  separated?: boolean;
}

/**
 * Row-level actions behind one button.
 *
 * The table shows two actions inline and hides the rest here: eight visible
 * buttons per row would turn the catalogue into a wall of icons and slow down
 * the scan the table exists for.
 *
 * The panel renders in a portal at a fixed position rather than inside the row.
 * A menu nested in the table is clipped by the table's own horizontal scroll
 * container as soon as it opens on the last rows.
 */
export function OverflowMenu({ label, actions }: { label: string; actions: MenuAction[] }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const close = useCallback(
    (restoreFocus = true) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [],
  );

  const openMenu = () => {
    setActiveIndex(0);
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    // Focus lands on the first entry, so the menu is usable from the keyboard
    // the moment it opens.
    requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    // The panel is positioned once, so any scroll or resize would leave it
    // floating away from its row. Closing is the honest response.
    const onReflow = () => setOpen(false);

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open]);

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? []);
    if (items.length === 0) return;

    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (delta === 0) {
      if (event.key === "Home") {
        event.preventDefault();
        items[0].focus();
        setActiveIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        items[items.length - 1].focus();
        setActiveIndex(items.length - 1);
      }
      return;
    }
    event.preventDefault();
    const next = (activeIndex + delta + items.length) % items.length;
    items[next].focus();
    setActiveIndex(next);
  };

  const panelWidth = 232;
  const panelHeight = actions.length * 38 + 16;
  const top =
    rect && rect.bottom + panelHeight > window.innerHeight ? rect.top - panelHeight - 6 : (rect?.bottom ?? 0) + 6;
  const left = rect ? Math.max(12, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 12)) : 0;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={`${id}-trigger`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openMenu();
          }
        }}
        className={clsx(
          "inline-flex h-8 w-8 items-center justify-center rounded-[var(--admin-radius-sm)] text-[var(--text-muted)] transition-colors",
          "hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
          open && "bg-[var(--gt-ink-100)] text-[var(--text-primary)]",
        )}
      >
        <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-labelledby={`${id}-trigger`}
            onKeyDown={onPanelKeyDown}
            style={{ position: "fixed", top, left, width: panelWidth }}
            className="gt-admin-dialog z-[350] rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel)] p-2 shadow-[var(--shadow-lg)]"
          >
            {actions.map((action) => (
              <div key={action.id}>
                {action.separated && <span aria-hidden="true" className="my-1.5 block h-px bg-[var(--border-subtle)]" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  onClick={() => {
                    close(false);
                    action.onSelect();
                  }}
                  className={clsx(
                    "flex w-full items-center gap-2.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-left text-[length:var(--text-body-sm)] font-medium transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                    action.tone === "danger"
                      ? "text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
                      : "text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <action.icon size={15} strokeWidth={1.9} aria-hidden="true" />
                  {action.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
