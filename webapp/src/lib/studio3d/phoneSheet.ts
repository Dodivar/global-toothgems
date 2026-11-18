/**
 * The phone's bottom sheet in the 3D Studio editor (`PhoneSheet`), its three
 * heights and where a drag lands. Pure, tested.
 *
 * `peek` shows only the sheet's header (its handle, the two tabs, Undo and
 * Redo) at the foot of the screen; `half` opens the library or the settings
 * under a stage still large enough to work on; `full` gives the list the
 * screen, over the stage. The stage is resized only to `peek` or `half`: a
 * full sheet covers it rather than squash the 3D canvas to nothing.
 */

export type SheetSnap = "peek" | "half" | "full";

export interface SheetHeights {
  peek: number;
  half: number;
  full: number;
}

/** Share of the editor's area the half-open sheet takes: the stage keeps the rest. */
export const HALF_SHARE = 0.5;
/** Below the top bar, the full sheet leaves this much of the stage showing. */
export const FULL_GAP = 12;
/** A flick faster than this (px per ms) goes on to the next height in its direction. */
export const FLICK_SPEED = 0.45;

/** The sheet's three heights for an editor area of `area` px and a header of `peek` px. */
export function sheetHeights(area: number, peek: number): SheetHeights {
  const full = Math.max(peek, area - FULL_GAP);
  const half = Math.min(full, Math.max(peek + 120, Math.round(area * HALF_SHARE)));
  return { peek, half, full };
}

/** The height the sheet stands at for a snap. */
export function heightOf(snap: SheetSnap, h: SheetHeights): number {
  return h[snap];
}

/** The stage's height: the area above the sheet, never below the half-open sheet's line. */
export function stageHeight(area: number, snap: SheetSnap, h: SheetHeights): number {
  return Math.max(0, area - Math.min(heightOf(snap, h), h.half));
}

const ORDER: SheetSnap[] = ["peek", "half", "full"];

/**
 * Where a released drag settles. `height` is where the finger left it,
 * `velocity` its speed in px per ms (positive: growing). A flick goes on to
 * the next height in its direction; otherwise the nearest height wins.
 */
export function settleSnap(height: number, velocity: number, h: SheetHeights): SheetSnap {
  if (Math.abs(velocity) >= FLICK_SPEED) {
    const growing = velocity > 0;
    if (growing) return ORDER.find((s) => h[s] > height + 1) ?? "full";
    return [...ORDER].reverse().find((s) => h[s] < height - 1) ?? "peek";
  }
  let best: SheetSnap = "peek";
  for (const s of ORDER) if (Math.abs(h[s] - height) < Math.abs(h[best] - height)) best = s;
  return best;
}

/** A tap on the handle: open a closed sheet halfway, close an open one. */
export function toggledSnap(snap: SheetSnap): SheetSnap {
  return snap === "peek" ? "half" : "peek";
}
