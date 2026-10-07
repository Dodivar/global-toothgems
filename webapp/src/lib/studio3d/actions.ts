import { scaleForSs } from "../../data/studioEditor";
import { studioGem } from "./gemRegistry";
import { getEngine, MAX_MODEL_BYTES, ModelImportError } from "./engine";
import { notify } from "./notices";
import { studioStore } from "./store";

/**
 * Editor commands shared by several controls (toolbar, inspector, context
 * menu, keyboard shortcuts), each with the feedback it gives. Keeping them
 * here means "Duplicate" says the same thing wherever it was pressed.
 */

/** Collision-aware duplication, falling back to the store if the engine is not mounted. */
export function duplicatePieces(ids: string[]) {
  if (!ids.length) return;
  const engine = getEngine();
  const n = engine ? engine.duplicateSelection(ids) : studioStore.duplicateJewels(ids);
  if (!n) notify("noRoomBeside", undefined, "warning");
}

/**
 * Duplicate the pieces onto their mirror image: across the arch midline ('h',
 * the other side of the smile) or across the bite ('v', the other arch). The
 * copies land reflected and become the selection.
 */
export function duplicateMirroredPieces(ids: string[], axis: "h" | "v" = "h") {
  if (!ids.length) return;
  const n = getEngine()?.duplicateMirrored(ids, axis) ?? 0;
  if (!n) notify(axis === "h" ? "noRoomMirrored" : "noRoomMirroredV", undefined, "warning");
}

export function removePieces(ids: string[]) {
  if (!ids.length) return;
  studioStore.removeJewels(ids);
}

/**
 * Turn the pieces a fixed angle clockwise on screen, in one undo step. Several
 * pieces turn as a group around their centre; one piece spins in place.
 */
export function rotatePieces(ids: string[], clockwiseDeg = 90) {
  const session = beginRotation(ids);
  session.set(clockwiseDeg);
  session.end();
}

/**
 * Move each piece `steps` stone sizes up (`> 0`) or down, among the sizes its
 * gem is sold in. One undo step; a piece already at its largest / smallest
 * size, or whose gem the shop no longer sells, stays as it is.
 */
export function resizePieces(ids: string[], steps: number) {
  const pieces = studioStore.jewels.filter((j) => ids.includes(j.id));
  if (!pieces.length || !steps) return;
  const next = (productId: string, ss: number) => {
    const sizes = studioGem(productId)?.sizes;
    if (!sizes?.length) return ss;
    const at = sizes.indexOf(ss);
    // a size the gem no longer offers first snaps to the nearest one it does
    if (at < 0) return sizes.reduce((best, s) => (Math.abs(s - ss) < Math.abs(best - ss) ? s : best), sizes[0]);
    return sizes[Math.min(sizes.length - 1, Math.max(0, at + steps))];
  };
  const updates = pieces
    .map((j) => ({ j, ss: next(j.productId, j.ss) }))
    .filter(({ j, ss }) => ss !== j.ss)
    .map(({ j, ss }) => ({ id: j.id, patch: { ss, scale: scaleForSs(ss) } }));

  if (!updates.length) {
    return;
  }
  studioStore.pushHistory();
  studioStore.applyPatches(updates);
}

/** A rotation driven live by a control (the stage's rotate handle), in screen degrees. */
export interface RotationSession {
  /** Set the turn since the session began: clockwise on screen, in degrees. */
  set(clockwiseDeg: number): void;
  /** Keep the current angle; the gesture is one undo step. */
  end(): void;
}

/**
 * Rotate pieces by a free angle while the customer turns a handle. One piece
 * spins around its own centre; a selection turns as a group around its
 * centre, as seen on screen (see the engine's `beginGroupTurn`). Angles are
 * whole degrees; the whole gesture is one undo step, recorded only if
 * something actually turned.
 */
export function beginRotation(ids: string[]): RotationSession {
  const engine = getEngine();
  const start = studioStore.jewels
    .filter((j) => ids.includes(j.id))
    .map((j) => ({ id: j.id, rotation: j.rotation, sign: engine?.screenClockwiseSign(j.id) ?? -1 }));
  // Without the engine (not mounted), each piece spins in place.
  const turn = engine?.beginGroupTurn(ids) ?? {
    patchesFor: (deg: number) => start.map((p) => ({ id: p.id, patch: { rotation: (((p.rotation + p.sign * deg) % 360) + 360) % 360 } })),
  };
  let current = 0;
  let recorded = false;
  return {
    set(clockwiseDeg) {
      const deg = Math.round(clockwiseDeg);
      if (deg === current || !start.length) return;
      if (!recorded) {
        studioStore.pushHistory();
        recorded = true;
      }
      current = deg;
      studioStore.applyPatches(turn.patchesFor(deg));
    },
    end() {
      /* the gesture was one undo step; nothing to announce */
    },
  };
}

export function mirrorSelection(axis: "h" | "v") {
  getEngine()?.mirrorSelection(axis);
}

export function distributeSelection() {
  getEngine()?.distributeSelectionAlongArch();
}

/**
 * Line the selected pieces up: 'h' at one height (one line per arch), moving
 * them only up or down; 'v' on one vertical line of the screen, as the
 * customer sees them (across both arches), moving them only left or right.
 */
export function alignSelection(axis: "h" | "v" = "h") {
  const engine = getEngine();
  const r = axis === "h" ? engine?.alignSelectionHorizontally() : engine?.alignSelectionVertically();
  if (r && !r.moved && r.skipped > 0) notify("alignNoRoom", undefined, "warning");
}

/** Bring one or several pieces to the middle of their tooth. */
export function centerOnTeeth(ids: string[]) {
  const r = getEngine()?.centerSelectionOnTeeth(ids);
  if (r && !r.moved && r.skipped > 0) notify("centerNoRoom", undefined, "warning");
}

/** Place a piece from the library on a tooth without a pointer (keyboard). */
export function placeOnTooth(typeId: string, toothId: string) {
  const ok = getEngine()?.placeOnTooth(typeId, toothId);
  if (!ok) notify("noRoomOnTooth", undefined, "warning");
}

/** Shared entry for a dentition model: toolbar button and drag-and-drop onto the stage. */
export async function importModelFile(file: File) {
  const engine = getEngine();
  if (!engine) return;
  if (!/\.(glb|gltf)$/i.test(file.name)) {
    notify("import.wrongType", undefined, "error");
    return;
  }
  if (file.size > MAX_MODEL_BYTES) {
    notify("import.tooLarge", { max: Math.round(MAX_MODEL_BYTES / (1024 * 1024)) }, "error");
    return;
  }
  try {
    const res = await engine.importGLB(file);
    if (res.mode === "teeth") notify("import.teeth", { count: res.teeth });
    else notify("import.free", undefined, "info");
  } catch (err) {
    const reason = err instanceof ModelImportError ? err.reason : "invalid";
    if (reason === "cancelled") return;
    notify(`import.${reason}`, { max: Math.round(MAX_MODEL_BYTES / (1024 * 1024)) }, "error");
  }
}

/** Back to the Studio's own dentition, from an imported model (or after the default failed to load). */
export async function resetModel() {
  await getEngine()?.loadDefaultModel();
}
