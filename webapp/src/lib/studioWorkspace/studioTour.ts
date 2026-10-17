import { useSyncExternalStore } from "react";
import type { PlacedJewelry } from "../../data/studioEditor";
import type { StudioSnapshot } from "../studio3d/store";

/**
 * The Studio's guided tour: the model behind the coach marks that walk a first
 * visitor through the real editor (`components/studio/workspace/StudioTour`).
 *
 * Everything here is deliberately free of React and of the DOM: the steps, what
 * each one asks for, whether the editor's own state says it was done, and where
 * the card goes beside the control it points at. The overlay reads this; the
 * rules are unit-tested (`studioTour.test.ts`).
 *
 * Two principles the rest of the file follows:
 *
 * - **Nothing is simulated.** A step is only ever "done" because the editor's
 *   own state changed — a gem armed, a piece on the arch, a piece edited, a
 *   camera gesture the engine reported. A step whose action cannot be observed
 *   (saving needs an account) simply has no goal and is read and passed.
 * - **Measured against a baseline, never against zero.** A returning artist
 *   arrives with a restored draft, so "place a gem" means one more piece than
 *   when the step opened.
 */

/** A control the tour points at: `data-tour="<value>"` on the element in the editor. */
export type TourAnchor =
  | "stage"
  | "library"
  | "library-toggle"
  | "inspector"
  | "inspector-toggle"
  | "history"
  | "save";

export type TourStepId = "stage" | "pick" | "place" | "adjust" | "refine" | "keep";

export interface TourContext {
  snap: StudioSnapshot;
  /** The stage as it was when this step opened. */
  base: TourBaseline;
  /** The engine reported an orbit, pan, zoom or view change since the step opened. */
  cameraMoved: boolean;
}

export interface TourStep {
  id: TourStepId;
  /** The control the card points at. */
  anchor: TourAnchor;
  /** Where that control is not on screen (a closed drawer): the switch that brings it back. */
  fallback?: TourAnchor;
  /** The card sits in a corner of the anchor rather than beside it (the anchor is the whole stage). */
  inside?: boolean;
  /** The 3D stage must be running for this step to make sense. */
  needsEngine?: boolean;
  /** What the step asks for, when the editor can tell it was done. `null`: read and pass. */
  goal: ((ctx: TourContext) => boolean) | null;
  /** On the way: the artist has started, but the step is not done yet. */
  midway?: (ctx: TourContext) => boolean;
  /** Once done, the tour moves on by itself after a beat — only where the next step is the obvious continuation. */
  autoAdvance?: boolean;
}

/**
 * The tour, in order. Six steps, each with one objective and one obvious next
 * action, all of them about controls that exist in the editor today.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    // Look around first: the gestures and the camera bar, before anything is asked of the artist.
    id: "stage",
    anchor: "stage",
    inside: true,
    needsEngine: true,
    goal: (c) => c.cameraMoved,
  },
  {
    // Pick a gem. A press on a library card arms it; a drag takes it to the arch.
    id: "pick",
    anchor: "library",
    fallback: "library-toggle",
    goal: (c) => !!c.snap.armedTypeId || !!c.snap.placingTypeId,
    autoAdvance: true,
  },
  {
    // Put it on a tooth — the first real moment of the design.
    id: "place",
    anchor: "stage",
    inside: true,
    needsEngine: true,
    goal: (c) => c.snap.jewels.length > c.base.pieceCount,
    autoAdvance: true,
  },
  {
    // Adjust it: colour, size, spin, position. Selecting is half the step, so it has its own line.
    id: "adjust",
    anchor: "inspector",
    fallback: "inspector-toggle",
    goal: pieceEdited,
    midway: (c) => c.snap.selectedJewelIds.length > 0,
  },
  {
    // Nothing is final: undo, redo, delete. The step that makes experimenting safe.
    id: "refine",
    anchor: "history",
    goal: (c) => c.snap.canRedo && !c.base.canRedo,
  },
  {
    // Where the design goes next. No goal: saving to the account needs a sign-in,
    // and the tour never claims a save it has not seen.
    id: "keep",
    anchor: "save",
    goal: null,
  },
];

/* ------------------------------------------------------------- baselines */

export interface TourBaseline {
  pieceCount: number;
  /** Every piece on the arch as it was, by id. */
  pieces: Record<string, string>;
  /** Whether something could already be redone — pressing Undo is what turns this on. */
  canRedo: boolean;
}

/**
 * A piece's whole appearance and placement in one string: what "the artist
 * changed something" is measured against. Positions are rounded to a hundredth
 * of a world unit, so the engine re-seating a loaded design on the enamel does
 * not read as an edit.
 */
export function pieceSignature(j: PlacedJewelry): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  return [
    j.productId,
    j.variantId ?? "",
    j.ss,
    // Field by field: the look is an object, and `[object Object]` would hide
    // exactly the change the tour asks for — a different colour.
    j.look.shape,
    j.look.material,
    j.look.color,
    j.look.effect,
    j.toothId,
    r(j.position.x),
    r(j.position.y),
    r(j.position.z),
    Math.round(j.rotation),
    r(j.offset ?? 0),
  ].join("|");
}

export function tourBaseline(snap: StudioSnapshot): TourBaseline {
  const pieces: Record<string, string> = {};
  for (const j of snap.jewels) pieces[j.id] = pieceSignature(j);
  return { pieceCount: snap.jewels.length, pieces, canRedo: snap.canRedo };
}

/** A piece that was already on the arch has been changed, or taken off it. */
function pieceEdited({ snap, base }: TourContext): boolean {
  const changed = snap.jewels.some((j) => base.pieces[j.id] !== undefined && base.pieces[j.id] !== pieceSignature(j));
  const removed = Object.keys(base.pieces).some((id) => !snap.jewels.some((j) => j.id === id));
  return changed || removed;
}

/* ------------------------------------------------------------- placement */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type CardDock = "beside" | "bottom" | "top";

export interface CardPlacement {
  left: number;
  top: number;
  dock: CardDock;
}

/** Below this the card spans the width of the screen and docks away from the anchor. */
export const NARROW_WIDTH = 760;
/** A phone held sideways: docking at the bottom would cover the stage's camera bar. */
export const SHORT_HEIGHT = 560;
const GUTTER = 12;
const GAP = 14;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max < min ? min : max);

/**
 * Where to put the card for a given anchor.
 *
 * On a narrow screen it docks to one edge, the one the anchor is not on, so the
 * control stays in view. With room to spare it sits beside the anchor — right,
 * else left, else under, else over — and a large anchor (the stage) takes the
 * card into its own bottom corner instead of pushing it off the screen. Every
 * result is clamped inside the viewport, so a card is never half out of reach.
 */
export function placeTourCard(anchor: Box | null, card: { width: number; height: number }, vp: { width: number; height: number }, inside = false): CardPlacement {
  const maxLeft = vp.width - card.width - GUTTER;
  const maxTop = vp.height - card.height - GUTTER;
  const centreX = clamp((vp.width - card.width) / 2, GUTTER, maxLeft);

  // No control to point at, or no room to stand beside one: dock to an edge.
  if (!anchor || vp.width < NARROW_WIDTH) {
    const anchorAbove = !anchor || anchor.top + anchor.height / 2 < vp.height / 2;
    // A short window puts the card over the stage's own controls at the bottom.
    const atBottom = vp.height >= SHORT_HEIGHT ? anchorAbove : !anchorAbove;
    return { left: centreX, top: atBottom ? maxTop : GUTTER, dock: atBottom ? "bottom" : "top" };
  }

  if (inside) {
    // Inside a large anchor: the bottom-right corner, clear of the camera bar in the middle.
    const left = clamp(anchor.left + anchor.width - card.width - GUTTER * 2, GUTTER, maxLeft);
    const top = clamp(anchor.top + anchor.height - card.height - GUTTER * 2, GUTTER, maxTop);
    return { left, top, dock: "beside" };
  }

  // Beside, over or under, whichever fits — and clamped either way, because a
  // control can be scrolled half out of the window (a stacked phone layout).
  const verticalTop = clamp(anchor.top + anchor.height / 2 - card.height / 2, GUTTER, maxTop);
  const rightOf = anchor.left + anchor.width + GAP;
  if (rightOf + card.width + GUTTER <= vp.width) return { left: clamp(rightOf, GUTTER, maxLeft), top: verticalTop, dock: "beside" };

  const leftOf = anchor.left - GAP - card.width;
  if (leftOf >= GUTTER) return { left: clamp(leftOf, GUTTER, maxLeft), top: verticalTop, dock: "beside" };

  const horizontalLeft = clamp(anchor.left + anchor.width / 2 - card.width / 2, GUTTER, maxLeft);
  const below = anchor.top + anchor.height + GAP;
  if (below + card.height + GUTTER <= vp.height) return { left: horizontalLeft, top: clamp(below, GUTTER, maxTop), dock: "beside" };

  const above = anchor.top - GAP - card.height;
  if (above >= GUTTER) return { left: horizontalLeft, top: clamp(above, GUTTER, maxTop), dock: "beside" };

  return { left: centreX, top: maxTop, dock: "bottom" };
}

/* ----------------------------------------------------------------- store */

/**
 * Which step the tour is on, in an external store like `workspaceUi`: the
 * welcome dialog, the help page and the stage's own button all start it, and
 * the overlay is mounted once, beside the editor.
 */
export interface TourState {
  running: boolean;
  /** Bumped by every `startTour`, so a second run is never mistaken for the first. */
  runId: number;
  /** Index into `steps`. */
  index: number;
  /** The steps of this run: those needing the 3D stage are left out where it could not start. */
  steps: readonly TourStep[];
  /** Steps whose goal was met during this run. */
  done: readonly TourStepId[];
}

const IDLE: TourState = { running: false, runId: 0, index: 0, steps: TOUR_STEPS, done: [] };

let state: TourState = IDLE;
const listeners = new Set<() => void>();

function set(next: TourState) {
  state = next;
  listeners.forEach((l) => l());
}

export function getTour(): TourState {
  return state;
}

export function useTour(): TourState {
  return useSyncExternalStore((cb) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, getTour);
}

/**
 * Start the tour from its first step. Without a 3D stage (WebGL refused), the
 * steps that are about the stage are left out rather than asking for a gesture
 * that cannot happen.
 */
export function startTour({ withStage = true }: { withStage?: boolean } = {}) {
  const steps = withStage ? TOUR_STEPS : TOUR_STEPS.filter((s) => !s.needsEngine);
  set({ running: true, runId: state.runId + 1, index: 0, steps, done: [] });
}

/** Leave the tour where it is. The design on the stage is untouched. */
export function exitTour() {
  if (!state.running) return;
  set({ ...IDLE, runId: state.runId });
}

export function goToTourStep(index: number) {
  if (!state.running) return;
  set({ ...state, index: clamp(index, 0, state.steps.length - 1) });
}

export function nextTourStep() {
  if (!state.running) return;
  if (state.index >= state.steps.length - 1) return;
  set({ ...state, index: state.index + 1 });
}

export function previousTourStep() {
  if (!state.running) return;
  if (state.index === 0) return;
  set({ ...state, index: state.index - 1 });
}

/** Remember that a step's objective was genuinely reached, for the progress trail. */
export function markTourStepDone(id: TourStepId) {
  if (!state.running || state.done.includes(id)) return;
  set({ ...state, done: [...state.done, id] });
}

/** Only for tests: forget the run in progress. */
export function resetTourForTests() {
  state = IDLE;
  listeners.clear();
}
