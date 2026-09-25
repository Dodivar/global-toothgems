import { PRESETS } from "../../data/studioEditor";
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

export function removePieces(ids: string[]) {
  if (!ids.length) return;
  studioStore.removeJewels(ids);
  notify("removed", { count: ids.length });
}

export function rotatePieces(ids: string[]) {
  const pieces = studioStore.jewels.filter((j) => ids.includes(j.id));
  if (!pieces.length) return;
  studioStore.pushHistory();
  studioStore.applyPatches(pieces.map((j) => ({ id: j.id, patch: { rotation: (j.rotation + 90) % 360 } })));
  notify("rotated", { count: pieces.length });
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

export function alignSelection() {
  const r = getEngine()?.alignSelectionAtEquator();
  if (!r) notify("nothingToAlign", undefined, "info");
  else if (r.skipped > 0) notify("alignedPartial", { count: r.skipped }, "info");
  else notify("aligned");
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
    studioStore.setModelMode(res.mode);
    if (res.mode === "teeth") notify("import.teeth", { count: res.teeth });
    else notify("import.free", undefined, "info");
  } catch (err) {
    const reason = err instanceof ModelImportError ? err.reason : "invalid";
    if (reason === "cancelled") return;
    notify(`import.${reason}`, { max: Math.round(MAX_MODEL_BYTES / (1024 * 1024)) }, "error");
  }
}

export function resetModel() {
  getEngine()?.resetToStudioModel();
  studioStore.setModelMode("studio");
  notify("modelReset");
}
