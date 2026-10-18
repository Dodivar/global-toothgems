import { beforeEach, describe, expect, it } from "vitest";
import type { PlacedJewelry } from "../../data/studioEditor";
import type { StudioSnapshot } from "../studio3d/store";
import {
  earnsAutoAdvance,
  exitTour,
  getTour,
  markTourStepDone,
  nextTourStep,
  NARROW_WIDTH,
  placeTourCard,
  previousTourStep,
  pieceSignature,
  resetTourForTests,
  startTour,
  tourBaseline,
  TOUR_STEPS,
  visibleStage,
  type TourStepId,
} from "./studioTour";

/* ------------------------------------------------------------- fixtures */

function piece(over: Partial<PlacedJewelry> = {}): PlacedJewelry {
  return {
    id: "p1",
    productId: "crystal-round",
    ss: 5,
    look: { shape: "round", material: "crystal", color: "#ffffff", effect: "none" },
    toothId: "11",
    position: { x: 1, y: 2, z: 3 },
    normal: { x: 0, y: 0, z: 1 },
    rotation: 0,
    scale: 1,
    ...over,
  };
}

function snapshot(over: Partial<StudioSnapshot> = {}): StudioSnapshot {
  return {
    jewels: [],
    groups: [],
    active: null,
    selectedJewelIds: [],
    selectedToothId: null,
    armedTypeId: null,
    placingTypeId: null,
    lasso: false,
    multiSelect: false,
    modelMode: "dentition",
    modelLoading: false,
    issues: [],
    lightPreset: "studio",
    clientName: "",
    contextMenu: null,
    canUndo: false,
    canRedo: false,
    ...over,
  };
}

const stepOf = (id: TourStepId) => {
  const step = TOUR_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`no step ${id}`);
  return step;
};

/** The goal of a step, read against the stage it opened on. */
function met(id: TourStepId, before: StudioSnapshot, now: StudioSnapshot, cameraMoved = false): boolean {
  const step = stepOf(id);
  if (!step.goal) throw new Error(`step ${id} has no goal`);
  return step.goal({ snap: now, base: tourBaseline(before), cameraMoved });
}

/* ------------------------------------------------------------- the steps */

describe("the guided tour's steps", () => {
  it("walks the editor once, with no step repeated", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(["stage", "pick", "place", "adjust", "refine", "keep"]);
    expect(new Set(TOUR_STEPS.map((s) => s.anchor)).size).toBeGreaterThan(1);
  });

  it("only moves on by itself where the next step is the obvious continuation", () => {
    expect(TOUR_STEPS.filter((s) => s.autoAdvance).map((s) => s.id)).toEqual(["pick", "place"]);
    // A step that goes on by itself must have something to detect in the first place.
    for (const step of TOUR_STEPS) if (step.autoAdvance) expect(step.goal).not.toBeNull();
  });

  it("leaves the last step without a goal: a save the tour cannot observe is never claimed", () => {
    expect(stepOf("keep").goal).toBeNull();
  });

  it("keeps the card off the stage path for the step that asks for a drag across it", () => {
    // "Pick a gem" invites dragging one from the library onto a tooth. A card
    // standing beside the library sits in that path, and a gem dropped on the
    // card is a gem dropped nowhere (the engine only places over the stage).
    expect(stepOf("pick").cardOnStage).toBe(true);
    expect(stepOf("pick").anchor).toBe("library");
  });

  it("every panel step names the switch that brings its panel back", () => {
    for (const step of TOUR_STEPS) {
      if (step.anchor === "library" || step.anchor === "inspector") expect(step.fallback).toBeTruthy();
    }
  });
});

describe("what each step asks for", () => {
  it("counts the camera step done only on a gesture the engine reported", () => {
    const s = snapshot();
    expect(met("stage", s, s, false)).toBe(false);
    expect(met("stage", s, s, true)).toBe(true);
  });

  it("counts a gem as picked whether it was armed or is being dragged", () => {
    const before = snapshot();
    expect(met("pick", before, snapshot({ armedTypeId: "crystal-round" }))).toBe(true);
    expect(met("pick", before, snapshot({ placingTypeId: "crystal-round" }))).toBe(true);
    expect(met("pick", before, before)).toBe(false);
  });

  it("counts a gem dragged straight onto a tooth, or placed with Enter, as picked", () => {
    // Neither gesture leaves an armed gem behind: the drag clears `placingTypeId`
    // on the drop, and Enter on a library card places directly (`placeOnTooth`).
    const before = snapshot();
    expect(met("pick", before, snapshot({ jewels: [piece()] }))).toBe(true);
  });

  it("measures placing from the step before, so one gesture is not asked for twice", () => {
    expect(stepOf("place").measureFrom).toBe("previous");
    // The gem landed while "pick" was open; "place" reads that step's baseline.
    const whenPickOpened = snapshot();
    expect(met("place", whenPickOpened, snapshot({ jewels: [piece()] }))).toBe(true);
  });

  it("measures placing against the stage as it was, not against an empty arch", () => {
    // A restored draft already has a piece: the step is about one more.
    const before = snapshot({ jewels: [piece()] });
    expect(met("place", before, before)).toBe(false);
    expect(met("place", before, snapshot({ jewels: [piece(), piece({ id: "p2" })] }))).toBe(true);
  });

  it("counts adjusting only once a piece that was already there has changed", () => {
    const before = snapshot({ jewels: [piece()] });
    expect(met("adjust", before, before)).toBe(false);
    // Selecting is not yet adjusting (the card says so through `midway`).
    expect(met("adjust", before, snapshot({ jewels: [piece()], selectedJewelIds: ["p1"] }))).toBe(false);
    expect(met("adjust", before, snapshot({ jewels: [piece({ ss: 9 })] }))).toBe(true);
    expect(met("adjust", before, snapshot({ jewels: [piece({ rotation: 45 })] }))).toBe(true);
    // Taking the piece off is an adjustment too.
    expect(met("adjust", before, snapshot({ jewels: [] }))).toBe(true);
    // Adding another piece is not: that was the previous step.
    expect(met("adjust", before, snapshot({ jewels: [piece(), piece({ id: "p2" })] }))).toBe(false);
  });

  it("reads Undo from the redo stack appearing, not from the history's depth", () => {
    const fresh = snapshot({ canUndo: true });
    expect(met("refine", fresh, fresh)).toBe(false);
    expect(met("refine", fresh, snapshot({ canRedo: true }))).toBe(true);
    // Someone who arrived with something already redoable has to undo again.
    const redoable = snapshot({ canRedo: true });
    expect(met("refine", redoable, redoable)).toBe(false);
  });

  it("says so rather than asking for an Undo that is greyed out", () => {
    const step = stepOf("refine");
    const base = tourBaseline(snapshot());
    // A draft restored from a previous visit: nothing in the history yet.
    expect(step.blocked?.({ snap: snapshot({ canUndo: false }), base, cameraMoved: false })).toBe(true);
    expect(step.blocked?.({ snap: snapshot({ canUndo: true }), base, cameraMoved: false })).toBe(false);
  });

  it("sees the selection as on the way, before anything has changed", () => {
    const step = stepOf("adjust");
    const base = tourBaseline(snapshot({ jewels: [piece()] }));
    expect(step.midway?.({ snap: snapshot({ jewels: [piece()] }), base, cameraMoved: false })).toBe(false);
    expect(step.midway?.({ snap: snapshot({ jewels: [piece()], selectedJewelIds: ["p1"] }), base, cameraMoved: false })).toBe(true);
  });
});

describe("a piece's signature", () => {
  it("ignores the engine re-seating a piece on the enamel by a hair", () => {
    expect(pieceSignature(piece({ position: { x: 1, y: 2, z: 3 } }))).toBe(pieceSignature(piece({ position: { x: 1.0004, y: 2, z: 3 } })));
  });

  it("notices a colour, a size, a tooth, a spin or a standoff", () => {
    const ref = pieceSignature(piece());
    expect(pieceSignature(piece({ ss: 7 }))).not.toBe(ref);
    expect(pieceSignature(piece({ toothId: "21" }))).not.toBe(ref);
    expect(pieceSignature(piece({ rotation: 90 }))).not.toBe(ref);
    expect(pieceSignature(piece({ offset: 0.4 }))).not.toBe(ref);
    expect(pieceSignature(piece({ look: { shape: "round", material: "crystal", color: "#ff00aa", effect: "none" } }))).not.toBe(ref);
  });
});

/* ------------------------------------------------- moving on by itself */

describe("earning the move to the next step", () => {
  const pick = stepOf("pick");
  const refine = stepOf("refine");

  it("takes the beat when the objective is reached while the step is open", () => {
    expect(earnsAutoAdvance({ step: pick, met: true, metBefore: false, last: false })).toBe(true);
  });

  it("stands still on a step already satisfied when it opens", () => {
    // The gem dragged from the library straight onto a tooth satisfies both
    // steps at once; the second one says so instead of jumping past itself.
    expect(earnsAutoAdvance({ step: pick, met: true, metBefore: true, last: false })).toBe(false);
  });

  it("stands still until the step's baseline is taken", () => {
    // `null`: the goal has not been read against anything yet, and a goal read
    // against nothing always says false — which must not pass for "not yet met".
    expect(earnsAutoAdvance({ step: pick, met: true, metBefore: null, last: false })).toBe(false);
  });

  it("never moves on by itself from a step that does not ask for it, or from the last", () => {
    expect(earnsAutoAdvance({ step: refine, met: true, metBefore: false, last: false })).toBe(false);
    expect(earnsAutoAdvance({ step: pick, met: true, metBefore: false, last: true })).toBe(false);
    expect(earnsAutoAdvance({ step: pick, met: false, metBefore: false, last: false })).toBe(false);
  });
});

/* --------------------------------------------------- the stage actually in view */

describe("the part of the stage in view", () => {
  // The stage reaches edge to edge behind its drawers (`StudioEditor`).
  const stage = { left: 84, top: 56, width: 1196, height: 664 };
  const library = { left: 84, top: 56, width: 264, height: 664 };
  const inspector = { left: 964, top: 56, width: 316, height: 664 };

  it("pulls in the edge each open drawer covers", () => {
    expect(visibleStage(stage, [library, inspector])).toEqual({ left: 348, top: 56, width: 616, height: 664 });
    expect(visibleStage(stage, [library])).toEqual({ left: 348, top: 56, width: 932, height: 664 });
    expect(visibleStage(stage, [inspector])).toEqual({ left: 84, top: 56, width: 880, height: 664 });
  });

  it("leaves the stage alone with both drawers closed", () => {
    expect(visibleStage(stage, [])).toEqual(stage);
  });

  it("leaves the stage alone where the panels are stacked under it", () => {
    // A phone held upright: the stage is on top, the panels below, sharing no height.
    const stacked = { left: 0, top: 56, width: 390, height: 450 };
    const below = { left: 0, top: 506, width: 390, height: 600 };
    expect(visibleStage(stacked, [below])).toEqual(stacked);
  });

  it("never turns the stage inside out when the drawers cover it all", () => {
    const wide = { left: 0, top: 0, width: 400, height: 400 };
    const seen = visibleStage(wide, [
      { left: 0, top: 0, width: 300, height: 400 },
      { left: 200, top: 0, width: 200, height: 400 },
    ]);
    expect(seen.width).toBeGreaterThanOrEqual(0);
    expect(seen.left).toBeGreaterThanOrEqual(wide.left);
  });
});

/* ----------------------------------------------------------- the card's place */

const CARD = { width: 320, height: 240 };
const DESKTOP = { width: 1440, height: 900 };

describe("where the card goes", () => {
  it("stands to the right of a control with room beside it", () => {
    const { left, dock } = placeTourCard({ left: 100, top: 300, width: 280, height: 200 }, CARD, DESKTOP);
    expect(dock).toBe("beside");
    expect(left).toBeGreaterThan(380);
  });

  it("flips to the left of a control hugging the right edge", () => {
    const { left, dock } = placeTourCard({ left: 1100, top: 300, width: 300, height: 200 }, CARD, DESKTOP);
    expect(dock).toBe("beside");
    expect(left).toBeLessThan(1100);
    expect(left).toBeGreaterThanOrEqual(12);
  });

  it("hangs from a small control near the top, instead of climbing over the bar above it", () => {
    // A switch in the stage's top corner: centring the card on it would put it
    // over the application bar, which is not the tour's to cover.
    const toggle = { left: 1180, top: 70, width: 90, height: 36 };
    const { top } = placeTourCard(toggle, CARD, DESKTOP);
    expect(top).toBe(70);
  });

  it("goes under a wide, shallow control such as the top bar", () => {
    const { top, dock } = placeTourCard({ left: 0, top: 0, width: 1440, height: 56 }, CARD, DESKTOP);
    expect(dock).toBe("beside");
    expect(top).toBeGreaterThanOrEqual(56);
  });

  it("sits against a large control's side, clear of the furniture along its edges", () => {
    const stage = { left: 0, top: 56, width: 1440, height: 844 };
    const { left, top } = placeTourCard(stage, CARD, DESKTOP, true);
    expect(left + CARD.width).toBeLessThanOrEqual(DESKTOP.width);
    expect(left).toBeGreaterThan(DESKTOP.width / 2);
    // Clear of the camera bar along the bottom and of the panel switches on top.
    expect(top).toBeGreaterThan(stage.top + 60);
    expect(top + CARD.height).toBeLessThan(stage.top + stage.height - 96);
  });

  it("docks on a phone, on the side the control is not", () => {
    const phone = { width: 390, height: 844 };
    expect(phone.width).toBeLessThan(NARROW_WIDTH);
    const low = placeTourCard({ left: 0, top: 600, width: 390, height: 240 }, CARD, phone);
    expect(low.dock).toBe("top");
    const high = placeTourCard({ left: 0, top: 60, width: 390, height: 240 }, CARD, phone);
    expect(high.dock).toBe("bottom");
  });

  it("keeps the stage's camera bar clear when it docks on a phone", () => {
    // A phone held upright: the stage on top, its camera bar along its bottom edge.
    const phone = { width: 375, height: 812 };
    const stage = { left: 0, top: 56, width: 375, height: 471 };
    const card = { width: 351, height: 340 };
    const { top } = placeTourCard(stage, card, phone);
    const barTop = stage.top + stage.height - 72;
    expect(top + card.height).toBeLessThanOrEqual(barTop);
    // And not over the application bar above the stage either.
    expect(top).toBeGreaterThanOrEqual(stage.top);
  });

  it("still docks a card too tall to clear anything, rather than losing it", () => {
    const phone = { width: 375, height: 812 };
    const stage = { left: 0, top: 56, width: 375, height: 471 };
    const huge = { width: 351, height: 600 };
    const { top, dock } = placeTourCard(stage, huge, phone);
    expect(dock).toBe("bottom");
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + huge.height).toBeLessThanOrEqual(phone.height);
  });

  it("docks to the top on a phone held sideways, where the bottom is the stage's own bar", () => {
    const landscape = { width: 740, height: 390 };
    const { dock } = placeTourCard({ left: 0, top: 40, width: 740, height: 300 }, { width: 320, height: 150 }, landscape);
    expect(dock).toBe("top");
  });

  it("keeps the card inside the window, whatever the anchor", () => {
    const vp = { width: 900, height: 600 };
    for (const anchor of [
      { left: -400, top: -200, width: 100, height: 100 },
      { left: 880, top: 580, width: 400, height: 400 },
      { left: 0, top: 0, width: 900, height: 600 },
    ]) {
      const { left, top } = placeTourCard(anchor, CARD, vp);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + CARD.width).toBeLessThanOrEqual(vp.width);
      expect(top + CARD.height).toBeLessThanOrEqual(vp.height);
    }
  });

  it("centres and docks when there is no control to point at", () => {
    const { left, dock } = placeTourCard(null, CARD, DESKTOP);
    expect(dock).toBe("bottom");
    expect(left).toBe((DESKTOP.width - CARD.width) / 2);
  });
});

/* ------------------------------------------------------------- the run */

describe("running the tour", () => {
  beforeEach(() => resetTourForTests());

  it("starts idle and does nothing until it is started", () => {
    expect(getTour().running).toBe(false);
    nextTourStep();
    expect(getTour().index).toBe(0);
    expect(getTour().running).toBe(false);
  });

  it("walks forward and back, without falling off either end", () => {
    startTour();
    expect(getTour().index).toBe(0);
    previousTourStep();
    expect(getTour().index).toBe(0);
    for (let i = 0; i < TOUR_STEPS.length + 3; i++) nextTourStep();
    expect(getTour().index).toBe(TOUR_STEPS.length - 1);
    previousTourStep();
    expect(getTour().index).toBe(TOUR_STEPS.length - 2);
  });

  it("leaves out the stage's steps where WebGL could not start", () => {
    startTour({ withStage: false });
    const ids = getTour().steps.map((s) => s.id);
    expect(ids).not.toContain("stage");
    expect(ids).not.toContain("place");
    expect(ids).toContain("pick");
    expect(getTour().steps.every((s) => !s.needsEngine)).toBe(true);
  });

  it("remembers the objectives actually reached, once each", () => {
    startTour();
    markTourStepDone("stage");
    markTourStepDone("stage");
    markTourStepDone("pick");
    expect(getTour().done).toEqual(["stage", "pick"]);
  });

  it("forgets the run on the way out", () => {
    startTour();
    nextTourStep();
    markTourStepDone("stage");
    exitTour();
    expect(getTour()).toMatchObject({ running: false, index: 0, done: [] });
  });
});
