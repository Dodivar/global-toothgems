import {
  ESTIMATE_PRICING,
  estimateTotalCents,
  sanitizeJewels,
  type PlacedJewelry,
} from "../../data/studioEditor";

/**
 * A saved design's `scene_data`: everything needed to rebuild the composition
 * in the 3D editor.
 *
 * The pieces are stored with their full transform (surface point, surface
 * normal, spin, size, finish, stand-off) exactly as the engine placed them —
 * never flattened to "which gem on which tooth", which could not be put back
 * where the artist left it. Versioned, so a later format can migrate old rows.
 *
 * Pure data and pure functions: persisted rows are untrusted input and pass
 * through `sanitizeScene` on the way in, like the local draft does.
 */

export const SCENE_VERSION = 1;
/** Upper bound on pieces per design; far above any real smile, it keeps a row small. */
export const SCENE_MAX_PIECES = 200;

/**
 * Which dentition the pieces were placed on — the editor's own model names
 * (`ModelMode`): the default scan, the procedural reference arch, or an
 * imported model (not stored, only named). On load, a design made on another
 * built-in model is re-seated tooth by tooth by the engine.
 */
export type SceneModel = "dentition" | "studio" | "teeth" | "free";
export type SceneLight = "studio" | "lamp" | "daylight";

export interface SceneCamera {
  position: [number, number, number];
  target: [number, number, number];
}

/** Pieces that arrived together from a saved Gem Group — kept so the grouping is not lost. */
export interface SceneGroupRef {
  id: string;
  /** The library group they came from (it may have been deleted since); null when unknown. */
  gemGroupId: string | null;
  name: string;
  pieceIds: string[];
}

export interface StudioScene {
  version: typeof SCENE_VERSION;
  model: SceneModel;
  lightPreset: SceneLight;
  camera: SceneCamera | null;
  pieces: PlacedJewelry[];
  groups: SceneGroupRef[];
}

const MODELS: SceneModel[] = ["dentition", "studio", "teeth", "free"];
const LIGHTS: SceneLight[] = ["studio", "lamp", "daylight"];
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isTriple = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(isNum);

/** Only groups whose pieces still exist, each listing only surviving pieces. */
export function pruneGroups(groups: SceneGroupRef[], pieces: PlacedJewelry[]): SceneGroupRef[] {
  const ids = new Set(pieces.map((p) => p.id));
  return groups
    .map((g) => ({ ...g, pieceIds: g.pieceIds.filter((id) => ids.has(id)) }))
    .filter((g) => g.pieceIds.length > 0);
}

export function createScene(parts: {
  pieces: PlacedJewelry[];
  groups?: SceneGroupRef[];
  model?: SceneModel;
  lightPreset?: SceneLight;
  camera?: SceneCamera | null;
}): StudioScene {
  const pieces = structuredClone(parts.pieces);
  return {
    version: SCENE_VERSION,
    model: parts.model ?? "studio",
    lightPreset: parts.lightPreset ?? "studio",
    camera: parts.camera ?? null,
    pieces,
    groups: pruneGroups(structuredClone(parts.groups ?? []), pieces),
  };
}

function sanitizeGroups(input: unknown): SceneGroupRef[] {
  if (!Array.isArray(input)) return [];
  const out: SceneGroupRef[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const g = raw as Record<string, unknown>;
    if (typeof g.id !== "string" || !Array.isArray(g.pieceIds)) continue;
    out.push({
      id: g.id.slice(0, 40),
      gemGroupId: typeof g.gemGroupId === "string" ? g.gemGroupId.slice(0, 64) : null,
      name: typeof g.name === "string" ? g.name.slice(0, 80) : "",
      pieceIds: g.pieceIds.filter((id): id is string => typeof id === "string").map((id) => id.slice(0, 40)),
    });
  }
  return out;
}

/** Rebuild a scene from untrusted JSON; anything malformed is dropped or defaulted. */
export function sanitizeScene(input: unknown): StudioScene {
  const data = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const pieces = sanitizeJewels(data.pieces).slice(0, SCENE_MAX_PIECES);
  const cam = data.camera as Record<string, unknown> | null | undefined;
  return {
    version: SCENE_VERSION,
    model: MODELS.includes(data.model as SceneModel) ? (data.model as SceneModel) : "studio",
    lightPreset: LIGHTS.includes(data.lightPreset as SceneLight) ? (data.lightPreset as SceneLight) : "studio",
    camera: cam && isTriple(cam.position) && isTriple(cam.target) ? { position: [...cam.position], target: [...cam.target] } : null,
    pieces,
    groups: pruneGroups(sanitizeGroups(data.groups), pieces),
  };
}

export interface SceneStats {
  elementCount: number;
  /** Indicative estimate in minor units — never a price to charge. */
  estimatedPriceMinor: number;
  currency: string;
}

export function sceneStats(pieces: PlacedJewelry[]): SceneStats {
  return {
    elementCount: pieces.length,
    estimatedPriceMinor: estimateTotalCents(pieces),
    currency: ESTIMATE_PRICING.currency,
  };
}

/**
 * Comparable key of a design's pieces: what "unsaved changes" is measured
 * against. Field order is fixed so two equal designs always give the same key.
 */
export function piecesKey(pieces: PlacedJewelry[]): string {
  return JSON.stringify(
    pieces.map((p) => [
      p.id,
      p.jewelryTypeId,
      p.toothId,
      p.position.x,
      p.position.y,
      p.position.z,
      p.normal.x,
      p.normal.y,
      p.normal.z,
      p.rotation,
      p.scale,
      p.color,
      p.customColor ?? null,
      p.offset ?? 0,
    ]),
  );
}

/**
 * Mirror-symmetric across the midline: every piece has a twin of the same
 * type, finish and size at the mirrored position (tolerance in millimetres).
 * A single centred piece counts as its own twin.
 */
export function isSymmetrical(pieces: PlacedJewelry[], tolerance = 1.2): boolean {
  if (pieces.length < 2) return false;
  const used = new Set<number>();
  return pieces.every((p, i) => {
    if (used.has(i)) return true;
    const twin = pieces.findIndex(
      (q, k) =>
        !used.has(k) &&
        q.jewelryTypeId === p.jewelryTypeId &&
        (q.customColor ?? q.color) === (p.customColor ?? p.color) &&
        Math.abs(q.scale - p.scale) < 0.051 &&
        Math.abs(q.position.x + p.position.x) <= tolerance &&
        Math.abs(q.position.y - p.position.y) <= tolerance,
    );
    if (twin < 0) return false;
    used.add(i);
    used.add(twin);
    return true;
  });
}
