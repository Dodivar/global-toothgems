import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import clsx from "clsx";
import type { TryOnCreation } from "../../../lib/studio3d/tryOn";
import {
  dragTransform,
  keyTransform,
  overlayFrame,
  pinchTransform,
  wheelTransform,
  type OverlayTransform,
} from "../../../lib/studio3d/tryOnTransform";
import type { TryOnGemRenderer } from "./gemOverlay";
import type { PreparedPhoto } from "./preparePhoto";

type Point = { x: number; y: number };

/**
 * The photo with the creation laid over it. The whole stage is the handle:
 * one finger or the mouse drags the creation, two fingers pinch to scale and
 * turn it, the wheel scales it, and the keyboard does all three once the
 * stage has focus (the keys are listed beside it). Marked `ph-no-capture` so
 * analytics session replay never records the client's face.
 */
export function TryOnStage({
  photo,
  creation,
  renderer,
  transform,
  onTransform,
  opacity,
  showOverlay,
  label,
  describedBy,
}: {
  photo: PreparedPhoto;
  creation: TryOnCreation;
  renderer: TryOnGemRenderer;
  transform: OverlayTransform;
  onTransform: (t: OverlayTransform) => void;
  opacity: number;
  showOverlay: boolean;
  label: string;
  describedBy: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ start: OverlayTransform; points: Point[] } | null>(null);
  const live = useRef({ transform, onTransform, size });
  useLayoutEffect(() => {
    live.current = { transform, onTransform, size };
  });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Not a React handler: scaling with the wheel must stop the dialog from scrolling, which needs a non-passive listener.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      live.current.onTransform(wheelTransform(live.current.transform, e.deltaY));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const local = (e: PointerEvent): Point => {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const rebase = () => {
    gesture.current = { start: live.current.transform, points: [...pointers.current.values()].slice(0, 2) };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!showOverlay) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    rebase();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const now = [...pointers.current.values()].slice(0, 2);
    const { start, points } = gesture.current;
    const { width, height } = live.current.size;
    if (points.length >= 2 && now.length >= 2) {
      onTransform(pinchTransform(start, [points[0], points[1]], [now[0], now[1]], width, height));
    } else if (points.length === 1 && now.length === 1) {
      onTransform(dragTransform(start, now[0].x - points[0].x, now[0].y - points[0].y, width, height));
    }
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (pointers.current.size > 0) rebase();
    else gesture.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!showOverlay) return;
    const next = keyTransform(transform, e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    onTransform(next);
  };

  const frame = overlayFrame(transform, size.width, size.height);
  const Overlay = renderer.Overlay;

  return (
    <div
      ref={stageRef}
      role="group"
      tabIndex={0}
      aria-label={label}
      aria-describedby={describedBy}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      className={clsx(
        "group ph-no-capture relative mx-auto touch-none select-none overflow-hidden rounded-[var(--radius-md)] bg-[var(--gt-ink-900)]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
        showOverlay ? "cursor-move" : "cursor-default",
      )}
      style={{ aspectRatio: `${photo.width} / ${photo.height}`, width: `min(100%, calc(58vh * ${photo.width / photo.height}))` }}
    >
      <img src={photo.url} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
      {showOverlay && size.width > 0 && (
        <div
          className="pointer-events-none absolute rounded-[var(--radius-sm)] outline-1 outline-offset-2 outline-white/70 group-hover:outline-dashed group-focus-visible:outline-dashed"
          style={{
            left: frame.left,
            top: frame.top,
            width: frame.width,
            height: frame.height,
            opacity,
            transform: `rotate(${transform.rotation}deg)`,
            transformOrigin: "50% 50%",
          }}
        >
          <Overlay creation={creation} width={frame.width} height={frame.height} />
        </div>
      )}
    </div>
  );
}
