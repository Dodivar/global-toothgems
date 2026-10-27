import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";

const MAX_SCALE = 4;
const STEP = 2;
const DOUBLE_TAP_MS = 300;

interface View {
  scale: number;
  x: number;
  y: number;
}

const FIT: View = { scale: 1, x: 0, y: 0 };

interface Point {
  x: number;
  y: number;
}

/**
 * The try-on image full screen, above the dialog. The zoom is this viewer's
 * own (pinch, double tap, wheel, buttons; up to ×4) and the page's pinch-zoom
 * is turned off on its stage: zooming the whole page over the Studio's 3D and
 * the dialog's layers made Safari on iPhone run out of memory and reload the
 * tab. Escape, the close button or a tap on the backdrop close it.
 */
export function ResultViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const { t } = useTranslation();
  const stage = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<View>(FIT);
  const viewRef = useRef<View>(FIT);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: View; mid: Point; dist: number; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const dragged = useRef(false);

  const apply = useCallback((next: View) => {
    const el = stage.current;
    const scale = Math.min(MAX_SCALE, Math.max(1, next.scale));
    // Keep the image over the stage: it may not be dragged further than its zoomed overhang.
    const maxX = el ? ((scale - 1) * el.clientWidth) / 2 : 0;
    const maxY = el ? ((scale - 1) * el.clientHeight) / 2 : 0;
    const clamped =
      scale <= 1.01 ? FIT : { scale, x: Math.min(maxX, Math.max(-maxX, next.x)), y: Math.min(maxY, Math.max(-maxY, next.y)) };
    viewRef.current = clamped;
    setView(clamped);
  }, []);

  /** A point of the screen, relative to the stage's centre (the transform's origin). */
  const local = (clientX: number, clientY: number): Point => {
    const rect = stage.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 } : { x: 0, y: 0 };
  };

  /** Zoom to `scale` keeping the image point under `at` where it is. */
  const zoomAt = useCallback(
    (scale: number, at: Point, from: View = viewRef.current) => {
      const ratio = Math.min(MAX_SCALE, Math.max(1, scale)) / from.scale;
      apply({ scale: from.scale * ratio, x: at.x - (at.x - from.x) * ratio, y: at.y - (at.y - from.y) * ratio });
    },
    [apply],
  );

  const startGesture = () => {
    const pts = [...pointers.current.values()];
    if (pts.length === 0) return (gesture.current = null);
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { view: viewRef.current, mid, dist, moved: gesture.current?.moved ?? false };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e.clientX, e.clientY));
    if (pointers.current.size === 1) gesture.current = null;
    startGesture();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e.clientX, e.clientY));
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    if (pts.length > 1 && g.dist > 0) {
      g.moved = true;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const scale = Math.min(MAX_SCALE, Math.max(1, (g.view.scale * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) / g.dist));
      const ratio = scale / g.view.scale;
      apply({ scale, x: mid.x - (g.mid.x - g.view.x) * ratio, y: mid.y - (g.mid.y - g.view.y) * ratio });
    } else if (pts.length === 1) {
      const dx = pts[0].x - g.mid.x;
      const dy = pts[0].y - g.mid.y;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      if (g.view.scale > 1) apply({ ...g.view, x: g.view.x + dx, y: g.view.y + dy });
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const tap = pointers.current.size === 0 && !gesture.current?.moved;
    dragged.current = !tap;
    if (pointers.current.size > 0) return startGesture();
    gesture.current = null;
    if (!tap) return;
    const now = e.timeStamp;
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      const at = local(e.clientX, e.clientY);
      if (viewRef.current.scale > 1) apply(FIT);
      else zoomAt(STEP + 0.5, at);
    } else {
      lastTap.current = now;
    }
  };

  // Escape and Tab are this viewer's while it is open: the dialog beneath listens on `document`, so the window's capture phase answers first.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        const root = closeRef.current?.closest("[role=dialog]");
        const items = root ? Array.from(root.querySelectorAll<HTMLElement>("button")) : [];
        if (items.length === 0) return;
        event.stopImmediatePropagation();
        event.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        items[(at + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  // Safari's own pinch (gesture events) and the wheel need non-passive listeners to be held back.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(viewRef.current.scale * Math.exp(-e.deltaY / 300), {
        x: e.clientX - rect.left - rect.width / 2,
        y: e.clientY - rect.top - rect.height / 2,
      });
    };
    el.addEventListener("gesturestart", stop, { passive: false });
    el.addEventListener("gesturechange", stop, { passive: false });
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("gesturestart", stop);
      el.removeEventListener("gesturechange", stop);
      el.removeEventListener("wheel", onWheel);
    };
  }, [zoomAt]);

  const zoomed = view.scale > 1;
  const controlClass =
    "inline-grid h-11 w-11 place-items-center rounded-full bg-[rgba(22,26,32,.72)] text-white transition-colors hover:bg-[rgba(22,26,32,.9)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="ph-no-capture fixed inset-0 z-[600] flex flex-col bg-[#0a0c10] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
    >
      <div
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          // A tap beside the image (not the end of a drag), at fit size, closes.
          if (e.target === e.currentTarget && !zoomed && !dragged.current) onClose();
        }}
        className="relative grid min-h-0 flex-1 touch-none select-none place-items-center overflow-hidden p-3"
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{ transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}
        />
      </div>
      <div className="flex flex-none items-center justify-center gap-3 p-3">
        <button type="button" className={controlClass} aria-label={t("studio.tryOn.viewer.zoomOut")} disabled={!zoomed} onClick={() => zoomAt(viewRef.current.scale / STEP, { x: 0, y: 0 })}>
          <ZoomOut size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={controlClass}
          aria-label={t("studio.tryOn.viewer.zoomIn")}
          disabled={view.scale >= MAX_SCALE}
          onClick={() => zoomAt(viewRef.current.scale * STEP, { x: 0, y: 0 })}
        >
          <ZoomIn size={20} aria-hidden="true" />
        </button>
        <button ref={closeRef} type="button" className={controlClass} aria-label={t("studio.tryOn.viewer.close")} onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="m-0 flex-none pb-3 text-center text-[12px] text-white/70">{t("studio.tryOn.viewer.hint")}</p>
    </div>,
    document.body,
  );
}
