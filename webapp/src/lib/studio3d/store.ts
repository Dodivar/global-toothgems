import { useSyncExternalStore } from "react";
import { sanitizeJewels, type PlacedJewelry, type Vec3 } from "../../data/studioEditor";
import type { PieceSpec } from "./gemCatalog";
import { uid, v3 } from "./math";
import { piecesKey, pruneGroups, sanitizeScene, type SceneCamera, type SceneGroupRef, type StudioScene } from "../studioWorkspace/scene";

/**
 * State of the design being composed in the 3D Studio.
 *
 * An external store (read with `useSyncExternalStore`) rather than React state,
 * because two very different readers share it: the React panels, and the
 * three.js engine, which renders every frame and must not wait for React.
 *
 * The working draft lives in this browser's storage, as
 * in the standalone Studio it comes from. Saving a design to the account is
 * the Studio workspace's job (`lib/studioWorkspace`): this store only loads a
 * saved scene onto the stage, serialises the stage back into one, and
 * remembers which saved creation the draft belongs to.
 */

/**
 * The model on stage: the default dentition scan, the procedural reference
 * arch (its fallback), or an imported model with separate teeth / merged.
 */
export type ModelMode = "dentition" | "studio" | "teeth" | "free";
const MODEL_MODES: ModelMode[] = ["dentition", "studio", "teeth", "free"];
const isModelMode = (v: unknown): v is ModelMode => MODEL_MODES.includes(v as ModelMode);
export type LightPreset = "studio" | "lamp" | "daylight";

export interface ContextMenuState {
  jewelId: string;
  x: number;
  y: number;
}

/**
 * The saved creation the design on the stage belongs to, if any, and the
 * version of it last stored — what "unsaved changes" is measured against.
 * Kept with the local draft so a reload does not unlink the two (which would
 * turn the next "Save" into a duplicate).
 */
export interface ActiveCreation {
  creationId: string;
  /** Account the creation belongs to; the link is dropped for anyone else. */
  ownerId: string;
  name: string;
  /** `piecesKey` of the pieces as last saved. */
  baselineKey: string;
  /** ISO time of the last successful save or load. */
  savedAt: string;
}

/** A scene waiting for the engine: its pieces are re-seated on the enamel, its camera restored. */
export interface PendingLoad {
  camera: SceneCamera | null;
  /** The model the scene was saved on. */
  model: ModelMode;
}

/** A piece the design check flagged: it overlaps another piece, or does not sit on a tooth. */
export interface DesignIssue {
  id: string;
  overlap: boolean;
  offTooth: boolean;
}

export interface StudioSnapshot {
  jewels: PlacedJewelry[];
  /** Pieces that arrived together from a Gem Group. */
  groups: SceneGroupRef[];
  active: ActiveCreation | null;
  selectedJewelIds: string[];
  selectedToothId: string | null;
  armedTypeId: string | null;
  placingTypeId: string | null;
  /** The lasso tool is on: a press on the stage draws a loop that selects the pieces inside. */
  lasso: boolean;
  modelMode: ModelMode;
  /** True while a model is being fetched and prepared: the stage says so. */
  modelLoading: boolean;
  issues: DesignIssue[];
  lightPreset: LightPreset;
  clientName: string;
  contextMenu: ContextMenuState | null;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Browser-storage key, namespaced like the site's other keys (`gt-lang`).
 * v2: pieces are the shop's gems (product, colour, stone size); drafts made
 * of the former built-in pieces are left behind.
 */
const DESIGN_KEY = "gt-studio3d-design-v2";
const HISTORY_LIMIT = 60;
const SAVE_DEBOUNCE_MS = 500;
export const CLIENT_NAME_MAX = 48;

function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // blocked or corrupt storage: start fresh
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage blocked: the design stays in memory */
  }
}


export class DesignStore {
  jewels: PlacedJewelry[] = [];
  selectedJewelIds: string[] = [];
  selectedToothId: string | null = null;
  armedTypeId: string | null = null;
  placingTypeId: string | null = null;
  lasso = false;
  modelMode: ModelMode = "dentition";
  modelLoading = true;
  issues: DesignIssue[] = [];
  /**
   * The model the design's positions were made on. Designs saved before the
   * default dentition carry no tag: they were made on the reference arch.
   */
  designModel: ModelMode = "studio";
  lightPreset: LightPreset = "studio";
  clientName = "";
  contextMenu: ContextMenuState | null = null;
  groups: SceneGroupRef[] = [];
  active: ActiveCreation | null = null;
  private pendingLoad: PendingLoad | null = null;
  /** True when the design was restored from a previous visit. */
  restored = false;
  private past: string[] = [];
  private future: string[] = [];
  private listeners = new Set<() => void>();
  private snap: StudioSnapshot;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** False for a design that is not this browser's draft (a shared link): never read nor written. */
  private readonly persist: boolean;

  constructor(options: { persist?: boolean } = {}) {
    this.persist = options.persist ?? true;
    const data = (this.persist ? readStorage(DESIGN_KEY) : null) as {
      jewels?: unknown;
      clientName?: unknown;
      model?: unknown;
      groups?: unknown;
      active?: unknown;
    } | null;
    if (data && typeof data === "object") {
      this.jewels = sanitizeJewels(data.jewels);
      if (isModelMode(data.model)) this.designModel = data.model;
      this.restored = this.jewels.length > 0;
      if (typeof data.clientName === "string") this.clientName = data.clientName.slice(0, CLIENT_NAME_MAX);
      this.groups = sanitizeScene({ pieces: this.jewels, groups: data.groups }).groups;
      this.active = readActive(data.active);
    }
    this.snap = this.buildSnap();
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = (): StudioSnapshot => this.snap;

  private commit() {
    this.snap = this.buildSnap();
    this.listeners.forEach((l) => l());
    if (!this.persist) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DEBOUNCE_MS);
  }
  private buildSnap(): StudioSnapshot {
    return {
      jewels: this.jewels,
      groups: this.groups,
      active: this.active,
      selectedJewelIds: this.selectedJewelIds,
      selectedToothId: this.selectedToothId,
      armedTypeId: this.armedTypeId,
      placingTypeId: this.placingTypeId,
      lasso: this.lasso,
      modelMode: this.modelMode,
      modelLoading: this.modelLoading,
      issues: this.issues,
      lightPreset: this.lightPreset,
      clientName: this.clientName,
      contextMenu: this.contextMenu,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    };
  }

  /** Record the current design as one undo step, before a change. */
  pushHistory() {
    const snap = JSON.stringify(this.jewels);
    if (this.past.length && this.past[this.past.length - 1] === snap && !this.future.length) return;
    this.past.push(snap);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.commit();
  }
  private fixSelection() {
    if (this.selectedJewelIds.length) {
      this.selectedJewelIds = this.selectedJewelIds.filter((id) => this.jewels.some((j) => j.id === id));
    }
  }

  /** Place a new piece of a shop gem (its default colour and size, see `pieceSpec`). */
  addJewel(spec: PieceSpec, toothId: string, position: Vec3, normal: Vec3): string {
    this.pushHistory();
    const j: PlacedJewelry = {
      id: uid(),
      productId: spec.productId,
      ...(spec.variantId ? { variantId: spec.variantId } : {}),
      ss: spec.ss,
      look: spec.look,
      toothId,
      position,
      normal,
      rotation: 0,
      scale: spec.scale,
    };
    this.jewels = [...this.jewels, j];
    this.selectedJewelIds = [j.id];
    this.selectedToothId = toothId;
    this.contextMenu = null;
    this.commit();
    return j.id;
  }
  /** Append pre-built pieces (e.g. collision-resolved duplicates) in one undo step. */
  insertJewels(copies: PlacedJewelry[]): number {
    if (!copies.length) return 0;
    this.pushHistory();
    this.jewels = [...this.jewels, ...copies];
    this.selectedJewelIds = copies.map((c) => c.id);
    this.selectedToothId = null;
    this.contextMenu = null;
    this.commit();
    return copies.length;
  }
  updateJewel(id: string, patch: Partial<PlacedJewelry>) {
    this.jewels = this.jewels.map((j) => (j.id === id ? { ...j, ...patch } : j));
    this.commit();
  }
  /** Apply a different patch to many pieces in one commit. */
  applyPatches(updates: { id: string; patch: Partial<PlacedJewelry> }[]) {
    if (!updates.length) return;
    const map = new Map(updates.map((u) => [u.id, u.patch]));
    this.jewels = this.jewels.map((j) => {
      const patch = map.get(j.id);
      return patch ? { ...j, ...patch } : j;
    });
    this.commit();
  }
  /** Apply the same patch to the whole selection in one commit. */
  updateSelected(patch: Partial<PlacedJewelry>) {
    if (!this.selectedJewelIds.length) return;
    const sel = new Set(this.selectedJewelIds);
    this.jewels = this.jewels.map((j) => (sel.has(j.id) ? { ...j, ...patch } : j));
    this.commit();
  }
  removeJewels(ids: string[]) {
    if (!ids.length) return;
    this.pushHistory();
    const kill = new Set(ids);
    this.jewels = this.jewels.filter((j) => !kill.has(j.id));
    this.selectedJewelIds = this.selectedJewelIds.filter((id) => !kill.has(id));
    this.contextMenu = null;
    this.commit();
  }
  /** Naive duplication beside each source; the engine's collision-aware version is preferred. */
  duplicateJewels(ids: string[]): number {
    const copies: PlacedJewelry[] = [];
    for (const id of ids) {
      const src = this.jewels.find((j) => j.id === id);
      if (!src) continue;
      const n = src.normal;
      let tx = -n.z;
      let tz = n.x;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const off = 1.6;
      copies.push({ ...src, id: uid(), position: v3(src.position.x + tx * off, src.position.y, src.position.z + tz * off) });
    }
    return this.insertJewels(copies);
  }
  selectJewel(id: string | null, opts?: { toggle?: boolean }) {
    if (id == null) this.selectedJewelIds = [];
    else if (opts?.toggle) {
      this.selectedJewelIds = this.selectedJewelIds.includes(id)
        ? this.selectedJewelIds.filter((x) => x !== id)
        : [...this.selectedJewelIds, id];
    } else this.selectedJewelIds = [id];
    this.selectedToothId =
      this.selectedJewelIds.length === 1 ? (this.jewels.find((j) => j.id === this.selectedJewelIds[0])?.toothId ?? null) : null;
    this.contextMenu = null;
    this.commit();
  }
  selectJewels(ids: string[]) {
    this.selectedJewelIds = [...ids];
    this.selectedToothId = null;
    this.contextMenu = null;
    this.commit();
  }
  selectTooth(id: string | null) {
    this.selectedToothId = id;
    this.selectedJewelIds = [];
    this.contextMenu = null;
    this.commit();
  }
  deselect() {
    this.selectedJewelIds = [];
    this.selectedToothId = null;
    this.armedTypeId = null;
    this.contextMenu = null;
    this.commit();
  }
  setArmed(id: string | null) {
    this.armedTypeId = id;
    // Placing a piece and drawing a lasso both want the next press on the stage.
    if (id) this.lasso = false;
    this.commit();
  }
  setPlacing(id: string | null) {
    this.placingTypeId = id;
    if (id) this.lasso = false;
    this.commit();
  }
  /** Turn the lasso tool on or off. On, it takes over from a piece armed for placing. */
  setLasso(on: boolean) {
    if (this.lasso === on) return;
    this.lasso = on;
    if (on) this.armedTypeId = null;
    this.contextMenu = null;
    this.commit();
  }
  setModelMode(m: ModelMode) {
    if (this.modelMode !== m) {
      this.modelMode = m;
      this.commit();
    }
  }
  setModelLoading(loading: boolean) {
    if (this.modelLoading !== loading) {
      this.modelLoading = loading;
      this.commit();
    }
  }
  /** The design check's findings (see the engine); only committed when they change. */
  setIssues(issues: DesignIssue[]) {
    const key = (list: DesignIssue[]) => list.map((i) => `${i.id}:${+i.overlap}${+i.offTooth}`).join("|");
    if (key(issues) === key(this.issues)) return;
    this.issues = issues;
    this.commit();
  }
  setDesignModel(model: ModelMode) {
    this.designModel = model;
  }
  /**
   * The design moved onto another model (re-seated tooth by tooth). A fresh
   * start for undo: the earlier steps hold positions on the old model.
   */
  replaceDesign(jewels: PlacedJewelry[], model: ModelMode) {
    this.jewels = jewels;
    this.designModel = model;
    this.past = [];
    this.future = [];
    this.fixSelection();
    this.contextMenu = null;
    this.commit();
  }
  setLightPreset(p: LightPreset) {
    if (this.lightPreset !== p) {
      this.lightPreset = p;
      this.commit();
    }
  }
  setClientName(n: string) {
    this.clientName = n.slice(0, CLIENT_NAME_MAX);
    this.commit();
  }
  openContextMenu(jewelId: string, x: number, y: number) {
    this.contextMenu = { jewelId, x, y };
    this.commit();
  }
  closeContextMenu() {
    if (this.contextMenu) {
      this.contextMenu = null;
      this.commit();
    }
  }
  undo() {
    if (!this.past.length) return;
    this.future.push(JSON.stringify(this.jewels));
    this.jewels = JSON.parse(this.past.pop()!);
    this.fixSelection();
    this.contextMenu = null;
    this.commit();
  }
  redo() {
    if (!this.future.length) return;
    this.past.push(JSON.stringify(this.jewels));
    this.jewels = JSON.parse(this.future.pop()!);
    this.fixSelection();
    this.contextMenu = null;
    this.commit();
  }
  /** Replace the whole design in one undo step (presets, clear all). */
  setJewels(jewels: PlacedJewelry[]) {
    this.pushHistory();
    this.jewels = jewels;
    this.deselect();
  }
  /** Transient state that must not survive leaving the editor. */
  resetSession() {
    this.armedTypeId = null;
    this.placingTypeId = null;
    this.lasso = false;
    this.contextMenu = null;
    // The next editor session loads the default dentition afresh.
    this.modelMode = "dentition";
    this.modelLoading = true;
    this.issues = [];
    this.commit();
  }
  saveNow() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.persist) return;
    writeStorage(DESIGN_KEY, {
      v: 2,
      jewels: this.jewels,
      clientName: this.clientName,
      model: this.designModel,
      groups: pruneGroups(this.groups, this.jewels),
      active: this.active,
    });
  }

  /* ---------- saved creations ---------- */

  /** The design as a `scene_data` document. */
  toScene(extra: { model: StudioScene["model"]; camera: SceneCamera | null }): StudioScene {
    return {
      version: 2,
      model: extra.model,

      lightPreset: this.lightPreset,
      camera: extra.camera,
      pieces: structuredClone(this.jewels),
      groups: pruneGroups(structuredClone(this.groups), this.jewels),
    };
  }

  /**
   * Put a saved scene on the stage, replacing the design. History starts over:
   * undo must not step back into another creation. The engine re-seats the
   * pieces and restores the camera when it picks up the pending load.
   */
  loadScene(scene: StudioScene, active: Omit<ActiveCreation, "baselineKey"> | null) {
    const clean = sanitizeScene(scene);
    this.jewels = clean.pieces;
    this.groups = clean.groups;
    this.lightPreset = clean.lightPreset;
    this.past = [];
    this.future = [];
    this.selectedJewelIds = [];
    this.selectedToothId = null;
    this.armedTypeId = null;
    this.contextMenu = null;
    this.active = active ? { ...active, baselineKey: piecesKey(this.jewels) } : null;
    this.designModel = clean.model;
    this.pendingLoad = { camera: clean.camera, model: clean.model };
    this.restored = false;
    this.commit();
  }

  hasPendingLoad(): boolean {
    return this.pendingLoad !== null;
  }
  /** Hand the pending load to the engine (once). */
  takePendingLoad(): PendingLoad | null {
    const load = this.pendingLoad;
    this.pendingLoad = null;
    return load;
  }

  /**
   * Apply the engine's re-seating of a freshly loaded scene. Not an edit: no
   * history step, and a design that was clean stays clean.
   */
  settleLoadedPieces(updates: { id: string; patch: Partial<PlacedJewelry> }[], model?: ModelMode) {
    if (model) this.designModel = model;
    const wasClean = !!this.active && this.active.baselineKey === piecesKey(this.jewels);
    if (updates.length) {
      const map = new Map(updates.map((u) => [u.id, u.patch]));
      this.jewels = this.jewels.map((j) => {
        const patch = map.get(j.id);
        return patch ? { ...j, ...patch } : j;
      });
    }
    if (wasClean && this.active) this.active = { ...this.active, baselineKey: piecesKey(this.jewels) };
    this.commit();
  }

  /** Link the stage to a creation that was just saved with exactly these pieces. */
  markSaved(active: Omit<ActiveCreation, "baselineKey">, savedPieces: PlacedJewelry[]) {
    this.active = { ...active, baselineKey: piecesKey(savedPieces) };
    this.commit();
    this.saveNow();
  }

  /** Rename the linked creation without touching the pieces or their saved state. */
  renameActive(name: string) {
    if (!this.active) return;
    this.active = { ...this.active, name };
    this.commit();
  }

  /** Forget the link (the creation was deleted, or another account signed in). */
  unlink() {
    if (!this.active) return;
    this.active = null;
    this.commit();
  }

  /** A blank stage for a new design (one undo step, so a slip can be taken back). */
  startNew() {
    if (this.jewels.length) this.pushHistory();
    this.jewels = [];
    this.groups = [];
    this.active = null;
    this.deselect();
  }

  /** Remember that these pieces arrived together from a Gem Group. */
  addGroupRef(ref: SceneGroupRef) {
    this.groups = [...pruneGroups(this.groups, this.jewels), ref];
    this.commit();
  }
}

function readActive(input: unknown): ActiveCreation | null {
  if (!input || typeof input !== "object") return null;
  const a = input as Record<string, unknown>;
  if (typeof a.creationId !== "string" || typeof a.ownerId !== "string" || typeof a.baselineKey !== "string") return null;
  return {
    creationId: a.creationId,
    ownerId: a.ownerId,
    name: typeof a.name === "string" ? a.name.slice(0, 80) : "",
    baselineKey: a.baselineKey,
    savedAt: typeof a.savedAt === "string" ? a.savedAt : new Date(0).toISOString(),
  };
}

/** The one design of this browser tab. Created when the editor chunk first loads. */
export const studioStore = new DesignStore();

export function useStudio(): StudioSnapshot {
  return useSyncExternalStore(studioStore.subscribe, studioStore.getSnapshot);
}
