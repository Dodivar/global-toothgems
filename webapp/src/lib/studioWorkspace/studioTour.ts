import { useSyncExternalStore } from "react";
import type { PlacedJewelry } from "../../data/studioEditor";
import { sizeKey } from "../gemOptions";
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
  /** The card sits inside the anchor rather than beside it (the anchor is the whole stage). */
  inside?: boolean;
  /**
   * Put the card on the stage instead of beside the anchor, while the
   * spotlight stays on the anchor. For a step whose gesture crosses the stage:
   * a card standing beside the library would sit in the very path the artist is
   * asked to drag a gem along, and a gem dropped on it is a gem dropped nowhere.
   */
  cardOnStage?: boolean;
  /** The 3D stage must be running for this step to make sense. */
  needsEngine?: boolean;
  /**
   * Measure against the baseline of the step before, not this step's own.
   * For a chain where one gesture can satisfy both steps at once — a gem
   * dragged from the library straight onto a tooth is picked *and* placed.
   */
  measureFrom?: "previous";
  /** What the step asks for, when the editor can tell it was done. `null`: read and pass. */
  goal: ((ctx: TourContext) => boolean) | null;
  /** On the way: the artist has started, but the step is not done yet. */
  midway?: (ctx: TourContext) => boolean;
  /** The action is not available yet: the card says what to do first, rather than asking for the impossible. */
  blocked?: (ctx: TourContext) => boolean;
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
    // Pick a gem. A press on a library card arms it, a drag takes it to the
    // arch, and Enter on a focused card puts it straight on the chosen tooth —
    // so a gem that has landed counts as picked too, whichever way it got there.
    id: "pick",
    anchor: "library",
    fallback: "library-toggle",
    cardOnStage: true,
    goal: (c) => !!c.snap.armedTypeId || !!c.snap.placingTypeId || c.snap.jewels.length > c.base.pieceCount,
    autoAdvance: true,
  },
  {
    // Put it on a tooth — the first real moment of the design. Measured from
    // the arch as it was when the previous step opened: a gem dragged all the
    // way from the library is already on a tooth by the time this step opens,
    // and the tour says so instead of asking for a second one.
    id: "place",
    anchor: "stage",
    inside: true,
    needsEngine: true,
    measureFrom: "previous",
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
    // A draft restored from a previous visit arrives with an empty history:
    // Undo is greyed out, and asking for it would be asking for nothing.
    blocked: (c) => !c.snap.canUndo,
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
    sizeKey(j.size),
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

/**
 * Whether reaching a step's objective earns the automatic move to the next one.
 *
 * Only a step that declares it, only when it is not the last, and only when the
 * objective was reached *while the step was open* — `metBefore` is what the
 * step's goal said a moment earlier, and `null` means the step has not been
 * read yet (its baseline is not taken, so its goal cannot be trusted). A step
 * already satisfied when it opens — the gem dragged from the library straight
 * onto a tooth, or a step the artist stepped back to — stands still and waits
 * to be read.
 */
export function earnsAutoAdvance({
  step,
  met,
  metBefore,
  last,
}: {
  step: TourStep;
  met: boolean;
  metBefore: boolean | null;
  last: boolean;
}): boolean {
  if (!step.autoAdvance || last || !met) return false;
  return metBefore === false;
}

/* ------------------------------------------------------------- placement */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type CardDock = "beside" | "bottom" | "top";

/**
 * The part of the stage actually in view.
 *
 * Side by side, the library and the inspector are drawers *over* the stage —
 * the 3D canvas keeps its full size behind them (`StudioEditor`) — so the
 * stage's own box reaches under them. Spotlighting that box would dim almost
 * nothing and put the card behind a panel, hence this: each edge the stage
 * shares with an open drawer is pulled in. Stacked under the stage (a phone
 * held upright), a panel shares no height with it and nothing is pulled in.
 */
export function visibleStage(stage: Box, panels: readonly Box[]): Box {
  let left = stage.left;
  let right = stage.left + stage.width;
  for (const p of panels) {
    const pRight = p.left + p.width;
    const sharesHeight = p.top < stage.top + stage.height && p.top + p.height > stage.top;
    if (!sharesHeight || p.width === 0) continue;
    if (p.left <= left + 2 && pRight > left) left = Math.min(pRight, right);
    else if (pRight >= right - 2 && p.left < right) right = Math.max(p.left, left);
  }
  return { left, top: stage.top, width: Math.max(right - left, 0), height: stage.height };
}

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
 * A control wide enough to hold its own furniture — the stage, whose camera
 * bar runs along its bottom edge — keeps that strip clear of the docked card.
 * Anything else is small enough that a docked card cannot swallow it.
 */
const CONTROL_STRIP = 72;

function keepsControlsClear(top: number, height: number, anchor: Box | null): boolean {
  if (!anchor || anchor.height < CONTROL_STRIP * 3) return true;
  const stripTop = anchor.top + anchor.height - CONTROL_STRIP;
  return top + height <= stripTop || top >= anchor.top + anchor.height;
}

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
    // A short window (a phone held sideways) is all stage: docking at the
    // bottom would land on its camera bar, so the card goes to the top.
    const preferBottom = vp.height >= SHORT_HEIGHT ? anchorAbove : !anchorAbove;
    const bottom = maxTop;
    // Below the control's own top edge, so a card at the top of the window
    // does not creep over the application bar above it.
    const top = anchor ? clamp(anchor.top + GUTTER, GUTTER, maxTop) : GUTTER;
    const order: [number, CardDock][] = preferBottom
      ? [
          [bottom, "bottom"],
          [top, "top"],
        ]
      : [
          [top, "top"],
          [bottom, "bottom"],
        ];
    const [at, dock] = order.find(([y]) => keepsControlsClear(y, card.height, anchor)) ?? order[0];
    return { left: centreX, top: at, dock };
  }

  if (inside) {
    // Inside a large anchor (the stage): against its right edge, half-way down.
    // The stage's own furniture is at its edges — the camera bar along the
    // bottom, the panel switches in the top corners — so the middle of a side
    // is the one place a card can sit without covering a control.
    const left = clamp(anchor.left + anchor.width - card.width - GUTTER * 2, GUTTER, maxLeft);
    const top = clamp(anchor.top + anchor.height / 2 - card.height / 2, GUTTER, maxTop);
    return { left, top, dock: "beside" };
  }

  // Beside, over or under, whichever fits — and clamped either way, because a
  // control can be scrolled half out of the window (a stacked phone layout).
  // Level with a tall control; for a small one near an edge, hanging from its
  // top rather than clamped, so the card does not creep over the top bar.
  const centred = anchor.top + anchor.height / 2 - card.height / 2;
  const verticalTop = centred >= GUTTER && centred <= maxTop ? centred : clamp(anchor.top, GUTTER, maxTop);
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
