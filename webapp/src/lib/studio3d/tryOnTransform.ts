/**
 * Where the creation sits on the smile photo, and how the artist moves it.
 *
 * The overlay is one box carrying all the gems, placed on the photo by a
 * centre, a width and a rotation — all normalised to the photo so the same
 * transform draws the live view at any screen size and the exported image at
 * the photo's own size (`overlayFrame` is the single formula both use).
 * Pure functions, no DOM.
 */

export interface OverlayTransform {
  /** Box centre, normalised to the photo (0..1). */
  cx: number;
  cy: number;
  /** Box width as a fraction of the photo's width. */
  width: number;
  /** Degrees, clockwise, -180..180. */
  rotation: number;
}

/** Height / width of the overlay box: a smile is wide. */
export const OVERLAY_ASPECT = 0.5;
export const MIN_WIDTH = 0.05;
export const MAX_WIDTH = 1.5;

export const DEFAULT_TRANSFORM: OverlayTransform = { cx: 0.5, cy: 0.55, width: 0.5, rotation: 0 };

/** An angle brought back to -180..180 degrees. */
export function normalizeDegrees(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
}

export function clampTransform(t: OverlayTransform): OverlayTransform {
  return {
    cx: Math.min(1, Math.max(0, t.cx)),
    cy: Math.min(1, Math.max(0, t.cy)),
    width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, t.width)),
    rotation: normalizeDegrees(t.rotation),
  };
}

export interface OverlayFrame {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  /** Top-left corner before rotation (the box rotates about its centre). */
  left: number;
  top: number;
  rotationRad: number;
}

/** The box in pixels on a stage (or canvas) of `stageWidth` × `stageHeight` showing the whole photo. */
export function overlayFrame(t: OverlayTransform, stageWidth: number, stageHeight: number, aspect = OVERLAY_ASPECT): OverlayFrame {
  const width = t.width * stageWidth;
  const height = width * aspect;
  const centerX = t.cx * stageWidth;
  const centerY = t.cy * stageHeight;
  return { centerX, centerY, width, height, left: centerX - width / 2, top: centerY - height / 2, rotationRad: (t.rotation * Math.PI) / 180 };
}

/** A point of the box (normalised 0..1) in stage pixels, rotation included. */
export function boxPointToStage(frame: OverlayFrame, x: number, y: number): { x: number; y: number } {
  const dx = (x - 0.5) * frame.width;
  const dy = (y - 0.5) * frame.height;
  const cos = Math.cos(frame.rotationRad);
  const sin = Math.sin(frame.rotationRad);
  return { x: frame.centerX + dx * cos - dy * sin, y: frame.centerY + dx * sin + dy * cos };
}

/* ----------------------------------------------------------- gestures */

/** One pointer dragged by (dx, dy) pixels on a stage of the given size. */
export function dragTransform(start: OverlayTransform, dx: number, dy: number, stageWidth: number, stageHeight: number): OverlayTransform {
  if (stageWidth <= 0 || stageHeight <= 0) return start;
  return clampTransform({ ...start, cx: start.cx + dx / stageWidth, cy: start.cy + dy / stageHeight });
}

type Point = { x: number; y: number };

/**
 * Two pointers: the midpoint moves the box, the spread scales it, the turn of
 * the line between the fingers rotates it — all relative to where the gesture
 * started, so it never drifts.
 */
export function pinchTransform(
  start: OverlayTransform,
  from: [Point, Point],
  to: [Point, Point],
  stageWidth: number,
  stageHeight: number,
): OverlayTransform {
  const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  const angle = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const d0 = dist(from[0], from[1]);
  if (d0 < 1 || stageWidth <= 0 || stageHeight <= 0) return start;
  const ratio = dist(to[0], to[1]) / d0;
  const mid0 = { x: (from[0].x + from[1].x) / 2, y: (from[0].y + from[1].y) / 2 };
  const mid1 = { x: (to[0].x + to[1].x) / 2, y: (to[0].y + to[1].y) / 2 };
  return clampTransform({
    cx: start.cx + (mid1.x - mid0.x) / stageWidth,
    cy: start.cy + (mid1.y - mid0.y) / stageHeight,
    width: start.width * ratio,
    rotation: start.rotation + angle(to[0], to[1]) - angle(from[0], from[1]),
  });
}

/** Mouse wheel / trackpad: scale about the box centre. */
export function wheelTransform(start: OverlayTransform, deltaY: number): OverlayTransform {
  return clampTransform({ ...start, width: start.width * Math.exp(-deltaY * 0.0015) });
}

export const KEY_STEPS = { move: 0.005, moveLarge: 0.03, scale: 1.03, scaleLarge: 1.15, rotate: 1, rotateLarge: 10 };

/**
 * The keyboard: arrows move, + / - scale, [ / ] rotate; Shift for larger
 * steps. Null for a key that does nothing (let it through).
 */
export function keyTransform(start: OverlayTransform, key: string, shift: boolean): OverlayTransform | null {
  const move = shift ? KEY_STEPS.moveLarge : KEY_STEPS.move;
  const scale = shift ? KEY_STEPS.scaleLarge : KEY_STEPS.scale;
  const turn = shift ? KEY_STEPS.rotateLarge : KEY_STEPS.rotate;
  switch (key) {
    case "ArrowLeft":
      return clampTransform({ ...start, cx: start.cx - move });
    case "ArrowRight":
      return clampTransform({ ...start, cx: start.cx + move });
    case "ArrowUp":
      return clampTransform({ ...start, cy: start.cy - move });
    case "ArrowDown":
      return clampTransform({ ...start, cy: start.cy + move });
    case "+":
    case "=":
      return clampTransform({ ...start, width: start.width * scale });
    case "-":
    case "_":
      return clampTransform({ ...start, width: start.width / scale });
    case "[":
    case "{":
      return clampTransform({ ...start, rotation: start.rotation - turn });
    case "]":
    case "}":
      return clampTransform({ ...start, rotation: start.rotation + turn });
    default:
      return null;
  }
}
