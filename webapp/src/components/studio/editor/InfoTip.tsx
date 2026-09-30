import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Info, type LucideIcon } from "lucide-react";
import { EditorPopover } from "./EditorPopover";

const HOVER_OPEN_MS = 120;
const HOVER_CLOSE_MS = 160;
/** Below this much room under the trigger, the bubble opens above it (when there is more room there). */
const ROOM_BELOW = 240;

/** Above or below: whichever side of `el` has room inside the panel that scrolls it (or the window). */
function sideFor(el: HTMLElement): "top" | "bottom" {
  let top = 0;
  let bottom = window.innerHeight;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow !== "auto" && overflow !== "scroll") continue;
    const box = p.getBoundingClientRect();
    top = Math.max(top, box.top);
    bottom = Math.min(bottom, box.bottom);
    break;
  }
  const r = el.getBoundingClientRect();
  const below = bottom - r.bottom;
  return below < ROOM_BELOW && r.top - top > below ? "top" : "bottom";
}

/**
 * A small icon button that shows an explanation in a bubble, so help text
 * stays out of the way until wanted. A mouse opens it by hovering (and moving
 * into the bubble keeps it open); a click or a tap pins it open until a press
 * elsewhere, Escape or a second click. Keyboard focus shows it too.
 *
 * Touch screens fire `pointerenter` before `click`: only a mouse opens on
 * hover, otherwise a tap would open the bubble and close it straight away.
 */
export function InfoTip({
  label,
  children,
  icon: Icon = Info,
  width = 280,
  align = "end",
  className,
}: {
  /** Names the button, e.g. "More about Layout". */
  label: string;
  children: ReactNode;
  icon?: LucideIcon;
  width?: number;
  align?: "start" | "end";
  className?: string;
}) {
  // Hovered or focused bubbles close by themselves; clicked ones stay.
  const [mode, setMode] = useState<null | "hover" | "click">(null);
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const wrap = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const open = mode !== null;
  const show = (next: (m: typeof mode) => typeof mode) => {
    if (wrap.current) setSide(sideFor(wrap.current));
    setMode(next);
  };

  const later = (fn: () => void, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // A hovered bubble never holds focus, so Escape is caught here for it.
  useEffect(() => {
    if (mode !== "hover") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setMode(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode]);

  return (
    <span
      ref={wrap}
      className={clsx("inline-flex", className)}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        window.clearTimeout(timer.current);
        if (!open) later(() => show((m) => m ?? "hover"), HOVER_OPEN_MS);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        window.clearTimeout(timer.current);
        if (mode === "hover") later(() => setMode((m) => (m === "hover" ? null : m)), HOVER_CLOSE_MS);
      }}
    >
      <EditorPopover
        label={label}
        open={open}
        onOpenChange={(next) => setMode(next ? "click" : null)}
        width={width}
        align={align}
        side={side}
        trigger={(props) => (
          <button
            type="button"
            {...props}
            onClick={() => {
              window.clearTimeout(timer.current);
              show((m) => (m === "click" ? null : "click"));
            }}
            onFocus={(e) => {
              if (e.currentTarget.matches(":focus-visible")) show((m) => m ?? "hover");
            }}
            onBlur={() => setMode((m) => (m === "hover" ? null : m))}
            aria-label={label}
            className={clsx(
              "inline-grid h-6 w-6 flex-none place-items-center rounded-full text-[var(--text-subtle)] transition-colors hover:bg-[var(--gt-blue-100)] hover:text-[var(--gt-blue-700)]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
              open && "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]",
            )}
          >
            <Icon size={14} aria-hidden="true" />
          </button>
        )}
      >
        {children}
      </EditorPopover>
    </span>
  );
}

/** The plain-text body most bubbles use. */
export function InfoTipText({ children }: { children: ReactNode }) {
  return <p className="m-0 p-2 text-[12px] font-normal normal-case leading-relaxed tracking-normal text-[var(--text-body)]">{children}</p>;
}
