import { useSyncExternalStore } from "react";
import { JEWELRY_BY_ID, sanitizeJewels, type PlacedJewelry, type Vec3 } from "../../data/studioEditor";
import { uid, v3 } from "./math";

/**
 * State of the design being composed in the 3D Studio.
 *
 * An external store (read with `useSyncExternalStore`) rather than React state,
 * because two very different readers share it: the React panels, and the
 * three.js engine, which renders every frame and must not wait for React.
 *
 * Persistence is local only, like the standalone Studio it comes from: the
 * current design and the named presets live in this browser's storage. Nothing
 * is sent to a server. When designs are saved to the account, this is the
 * place that changes — the rest of the editor only talks to the store.
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

/** A piece the design check flagged: it overlaps another piece, or does not sit on a tooth. */
export interface DesignIssue {
  id: string;
  overlap: boolean;
  offTooth: boolean;
}

export interface StudioSnapshot {
  jewels: PlacedJewelry[];
  selectedJewelIds: string[];
  selectedToothId: string | null;
  armedTypeId: string | null;
  placingTypeId: string | null;
  hoveredToothId: string | null;
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

/** Browser-storage keys, namespaced like the site's other keys (`gt-lang`). */
const DESIGN_KEY = "gt-studio3d-design-v1";
const PRESETS_KEY = "gt-studio3d-presets-v1";
const HISTORY_LIMIT = 60;
const SAVE_DEBOUNCE_MS = 500;
export const PRESET_NAME_MAX = 40;
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
  hoveredToothId: string | null = null;
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
  /** True when the design was restored from a previous visit. */
  restored = false;
  private past: string[] = [];
  private future: string[] = [];
  private listeners = new Set<() => void>();
  private snap: StudioSnapshot;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const data = readStorage(DESIGN_KEY) as { jewels?: unknown; clientName?: unknown; model?: unknown } | null;
    if (data && typeof data === "object") {
      this.jewels = sanitizeJewels(data.jewels);
      if (isModelMode(data.model)) this.designModel = data.model;
      this.restored = this.jewels.length > 0;
      if (typeof data.clientName === "string") this.clientName = data.clientName.slice(0, CLIENT_NAME_MAX);
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
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), SAVE_DEBOUNCE_MS);
  }
  private buildSnap(): StudioSnapshot {
    return {
      jewels: this.jewels,
      selectedJewelIds: this.selectedJewelIds,
      selectedToothId: this.selectedToothId,
      armedTypeId: this.armedTypeId,
      placingTypeId: this.placingTypeId,
      hoveredToothId: this.hoveredToothId,
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

  addJewel(typeId: string, toothId: string, position: Vec3, normal: Vec3): string {
    this.pushHistory();
    const def = JEWELRY_BY_ID[typeId];
    const j: PlacedJewelry = {
      id: uid(),
      jewelryTypeId: typeId,
      toothId,
      position,
      normal,
      rotation: 0,
      scale: def.defaultScale,
      color: def.defaultColor,
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
    this.commit();
  }
  setPlacing(id: string | null) {
    this.placingTypeId = id;
    this.commit();
  }
  setHoveredTooth(id: string | null) {
    if (this.hoveredToothId !== id) {
      this.hoveredToothId = id;
      this.commit();
    }
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
    this.hoveredToothId = null;
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
    writeStorage(DESIGN_KEY, { v: 1, jewels: this.jewels, clientName: this.clientName, model: this.designModel });
  }
}

/** The one design of this browser tab. Created when the editor chunk first loads. */
export const studioStore = new DesignStore();

export function useStudio(): StudioSnapshot {
  return useSyncExternalStore(studioStore.subscribe, studioStore.getSnapshot);
}

/* ------------------------------------------------------ named presets */

export interface UserPreset {
  id: string;
  name: string;
  createdAt: number;
  jewels: PlacedJewelry[];
  /** The model the pieces were placed on; untagged presets predate the default dentition. */
  model: ModelMode;
}

function loadUserPresets(): UserPreset[] {
  const arr = readStorage(PRESETS_KEY);
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((p) => p && typeof p.id === "string" && typeof p.name === "string")
    .map((p) => ({
      id: p.id as string,
      name: (p.name as string).slice(0, PRESET_NAME_MAX),
      createdAt: typeof p.createdAt === "number" ? p.createdAt : 0,
      jewels: sanitizeJewels(p.jewels),
      model: isModelMode(p.model) ? p.model : ("studio" as const),
    }))
    .filter((p) => p.jewels.length > 0);
}

let userPresets: UserPreset[] = loadUserPresets();
const presetListeners = new Set<() => void>();

function emitPresets() {
  writeStorage(PRESETS_KEY, userPresets);
  presetListeners.forEach((l) => l());
}

export function saveUserPreset(name: string): UserPreset | null {
  const clean = name.trim().slice(0, PRESET_NAME_MAX);
  if (!clean || !studioStore.jewels.length) return null;
  const p: UserPreset = {
    id: uid(),
    name: clean,
    createdAt: Date.now(),
    jewels: structuredClone(studioStore.jewels),
    model: studioStore.designModel,
  };
  userPresets = [p, ...userPresets];
  emitPresets();
  return p;
}

export function deleteUserPreset(id: string) {
  userPresets = userPresets.filter((p) => p.id !== id);
  emitPresets();
}

/**
 * Replace the design with a saved preset. `adapt` re-seats pieces saved on
 * another model onto the one on stage (the engine's `adaptDesign`).
 */
export function applyUserPreset(p: UserPreset, adapt?: (jewels: PlacedJewelry[], from: ModelMode) => PlacedJewelry[]) {
  const jewels = p.jewels.map((j) => ({ ...j, id: uid() }));
  studioStore.setJewels(adapt ? adapt(jewels, p.model) : jewels);
}

export function useUserPresets(): UserPreset[] {
  return useSyncExternalStore(
    (cb) => {
      presetListeners.add(cb);
      return () => {
        presetListeners.delete(cb);
      };
    },
    () => userPresets,
  );
}
