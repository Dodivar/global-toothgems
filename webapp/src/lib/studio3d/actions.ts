import { PRESETS, SCALE_RANGE } from "../../data/studioEditor";
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
  else if (n < ids.length) notify("duplicatedPartial", { count: n, total: ids.length }, "info");
  else notify("duplicated", { count: n });
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
  else if (n < ids.length) notify("duplicatedPartial", { count: n, total: ids.length }, "info");
  else notify(axis === "h" ? "duplicatedMirrored" : "duplicatedMirroredV", { count: n });
}

export function removePieces(ids: string[]) {
  if (!ids.length) return;
  studioStore.removeJewels(ids);
  notify("removed", { count: ids.length });
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
 * Grow (`steps > 0`) or shrink the pieces by whole slider steps, each within
 * the allowed diameters. One undo step; says so when every piece is already
 * at the limit.
 */
export function resizePieces(ids: string[], steps: number) {
  const pieces = studioStore.jewels.filter((j) => ids.includes(j.id));
  if (!pieces.length || !steps) return;
  const { min, max, step } = SCALE_RANGE;
  // Rounded to the slider's grid, so repeated taps never drift (0.95 + 0.05 stays 1).
  const next = (s: number) => Math.min(max, Math.max(min, Number((Math.round(s / step + steps) * step).toFixed(2))));
  const updates = pieces.filter((j) => next(j.scale) !== j.scale).map((j) => ({ id: j.id, patch: { scale: next(j.scale) } }));
  if (!updates.length) {
    notify(steps > 0 ? "sizeMax" : "sizeMin", undefined, "info");
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
      if (recorded && current % 360 !== 0) notify("rotated", { count: start.length });
    },
  };
}

export function mirrorSelection(axis: "h" | "v") {
  const r = getEngine()?.mirrorSelection(axis);
  if (!r) return;
  if (r.skipped > 0) notify(axis === "h" ? "mirroredHPartial" : "mirroredVPartial", { count: r.skipped }, "info");
  else notify(axis === "h" ? "mirroredH" : "mirroredV");
}

export function distributeSelection() {
  const r = getEngine()?.distributeSelectionAlongArch();
  if (!r) notify("distributeNeedsThree", undefined, "info");
  else if (r.skipped > 0) notify("distributedPartial", { count: r.skipped }, "info");
  else notify("distributed");
}

/** Line the selected pieces up at one height (one line per arch), without moving them across their teeth. */
export function alignSelection() {
  const r = getEngine()?.alignSelectionHorizontally();
  if (!r) notify("nothingToAlign", undefined, "info");
  else if (!r.moved && r.skipped > 0) notify("alignNoRoom", undefined, "warning");
  else if (r.skipped > 0) notify("alignedPartial", { count: r.skipped }, "info");
  else notify("aligned");
}

/** Bring one or several pieces to the middle of their tooth. */
export function centerOnTeeth(ids: string[]) {
  const r = getEngine()?.centerSelectionOnTeeth(ids);
  if (!r) notify("nothingToCenter", undefined, "info");
  else if (!r.moved && r.skipped > 0) notify("centerNoRoom", undefined, "warning");
  else if (r.skipped > 0) notify("centeredPartial", { count: r.skipped }, "info");
  else notify("centered", { count: r.moved });
}

/** Replace the design with a ready-made preset (one undo step). */
export function applyPreset(id: string) {
  const engine = getEngine();
  const preset = PRESETS.find((p) => p.id === id);
  if (!engine || !preset) return;
  const jewels = engine.buildPresetJewels(preset.items);
  if (!jewels.length) {
    notify("presetUnavailable", undefined, "warning");
    return;
  }
  studioStore.setJewels(jewels);
  notify("presetApplied", { name: `studio.editor.presets.${id}.name` });
}

export function clearDesign() {
  if (!studioStore.jewels.length) return;
  studioStore.setJewels([]);
  notify("cleared");
}

/** Place a piece from the library on a tooth without a pointer (keyboard). */
export function placeOnTooth(typeId: string, toothId: string) {
  const ok = getEngine()?.placeOnTooth(typeId, toothId);
  if (ok) notify("placedOnTooth", { tooth: toothId });
  else notify("noRoomOnTooth", undefined, "warning");
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
  notify("import.started", { name: file.name }, "info");
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
  const ok = await getEngine()?.loadDefaultModel();
  if (ok) notify("modelReset");
}
