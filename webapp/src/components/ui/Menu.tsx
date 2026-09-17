import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

/**
 * Dropdown menu anchored to its own trigger.
 *
 * Used for the orders table's per-row `…` actions and for the toolbar's filter
 * popovers, so it has to work with the keyboard: arrow keys move through the
 * items, Escape closes and returns focus to the trigger, and a click outside
 * dismisses. `aria-haspopup` plus `aria-expanded` on the trigger is what tells
 * a screen-reader user the button opens something rather than acting.
 *
 * Positioning is CSS: the panel is anchored to its trigger's edge, with
 * `align` choosing which one. The single measurement happens at open time and
 * only decides whether the panel goes down or up — see `clippingBounds`. It is
 * not re-run on scroll, because the menu closes on any outside interaction, so
 * it never has to survive being scrolled away from its trigger.
 */

export interface MenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Rendered in the error tone and separated from the rest by a rule. */
  destructive?: boolean;
  disabled?: boolean;
}

export function Menu({
  label,
  trigger,
  items,
  align = "end",
  width = 232,
  footer,
  children,
}: {
  /** Accessible name of the trigger. */
  label: string;
  /** Renders the trigger. `props` must be spread onto a real `<button>`. */
  trigger: (props: {
    ref: (node: HTMLButtonElement | null) => void;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu" | "dialog";
    "aria-controls": string;
    "aria-label": string;
  }) => ReactNode;
  /** Action list. Omit when passing free-form `children` (a filter popover). */
  items?: MenuItem[];
  align?: "start" | "end";
  width?: number;
  footer?: ReactNode;
  /** Free-form panel content, for popovers that are not action lists. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Defined once rather than inline in the trigger call: a ref setter created
  // during render is both extra work per render and something the linter reads
  // as touching a ref while rendering.
  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
  }, []);

  /**
   * Nearest ancestor that clips its overflow.
   *
   * The orders table scrolls inside its own card, and an absolutely positioned
   * panel is clipped by that box rather than by the viewport — so the `…` menu
   * on the last visible row would open into nothing. The limit that matters is
   * whichever edge comes first, the scroll container's or the window's.
   */
  const clippingBounds = useCallback((node: HTMLElement) => {
    let parent = node.parentElement;
    while (parent) {
      const { overflow, overflowY } = getComputedStyle(parent);
      if (/(auto|scroll|hidden)/.test(`${overflow} ${overflowY}`)) {
        const rect = parent.getBoundingClientRect();
        return { top: Math.max(0, rect.top), bottom: Math.min(window.innerHeight, rect.bottom) };
      }
      parent = parent.parentElement;
    }
    return { top: 0, bottom: window.innerHeight };
  }, []);

  // Decided when the menu opens, not on every scroll: the panel closes on an
  // outside interaction anyway, so it never has to survive being scrolled.
  const openMenu = useCallback(() => {
    const node = triggerRef.current;
    if (node) {
      const rect = node.getBoundingClientRect();
      const bounds = clippingBounds(node);
      const estimate = Math.min(320, 28 + (items?.length ?? 4) * 38);
      const below = bounds.bottom - rect.bottom;
      const above = rect.top - bounds.top;
      setUp(below < estimate && above > below);
    }
    setOpen(true);
  }, [clippingBounds, items]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const options = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      if (options.length === 0) return;
      event.preventDefault();
      const current = options.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "ArrowDown"
          ? (current + 1) % options.length
          : (current - 1 + options.length) % options.length;
      options[next]?.focus();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Opening with the keyboard should land on the first item; opening with the
  // mouse should not steal the pointer's target, so only move focus when the
  // list is an action menu.
  useEffect(() => {
    if (!open || !items) return;
    const first = panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
  }, [open, items]);

  const run = (item: MenuItem) => {
    setOpen(false);
    triggerRef.current?.focus();
    item.onSelect();
  };

  return (
    <div ref={wrap} className="relative inline-flex">
      {trigger({
        ref: setTriggerRef,
        onClick: () => (open ? setOpen(false) : openMenu()),
        "aria-expanded": open,
        "aria-haspopup": items ? "menu" : "dialog",
        "aria-controls": panelId,
        "aria-label": label,
      })}

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role={items ? "menu" : undefined}
          aria-label={items ? label : undefined}
          style={{ width }}
          className={clsx(
            "absolute z-50 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-md)]",
            "motion-safe:animate-[gt-menu-in_var(--duration-fast)_var(--ease-out-soft)_both]",
            up ? "bottom-[calc(100%+6px)] origin-bottom" : "top-[calc(100%+6px)] origin-top",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items?.map((item, index) => {
            const Icon = item.icon;
            const opensGroup = item.destructive && !items[index - 1]?.destructive && index > 0;
            return (
              <div key={item.id}>
                {opensGroup && <span role="none" className="my-1.5 block h-px bg-[var(--border-subtle)]" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => run(item)}
                  className={clsx(
                    "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[length:var(--text-body-sm)] transition-colors disabled:pointer-events-none disabled:opacity-40",
                    item.destructive
                      ? "text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
                      : "text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {Icon && <Icon size={15} strokeWidth={2} aria-hidden="true" className="flex-none" />}
                  <span className="truncate">{item.label}</span>
                </button>
              </div>
            );
          })}
          {children && <div className="grid gap-3 p-2">{children}</div>}
          {footer && <div className="mt-1 border-t border-[var(--border-subtle)] px-2 pt-2">{footer}</div>}
        </div>
      )}
    </div>
  );
}
