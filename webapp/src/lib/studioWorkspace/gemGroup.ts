import {
  isGemRef,
  OFFSET_RANGE,
  sanitizeLook,
  sanitizeSs,
  scaleForSs,
  type GemLook,
  type PlacedJewelry,
  type Vec3,
} from "../../data/studioEditor";
import { ARCH_FRAME_BY_ID, approxLabialPoint } from "../studio3d/archLayout";
import { currentEstimate } from "../studio3d/gemRegistry";

/**
 * A Gem Group's arrangement: several pieces kept together as a reusable
 * block, like a macro.
 *
 * World positions only make sense on the tooth they were placed on, so a
 * group stores each piece relative to a local frame instead: its anchor
 * tooth's labial centre, with axes along the arch, up, and out of the enamel.
 * Inserting the group rebuilds that frame on the chosen tooth and maps every
 * piece back, which keeps the spacing, the order, the spin, the size and the
 * colour of the original arrangement — the same shop gems. The engine then re-seats each piece on
 * the enamel and slides it clear of anything already there.
 */

export interface GroupPiece {
  productId: string;
  variantId?: string;
  ss: number;
  look: GemLook;
  rotation: number;
  offset?: number;
  /** Millimetres from the anchor: x along the arch (viewer's right), y up, z out of the enamel. */
  at: Vec3;
  /** Surface normal in the same frame (unit). */
  facing: Vec3;
}

export interface GemGroupData {
  version: 2;
  /** Tooth the group was made on — where "insert" puts it when no tooth is chosen. */
  anchorToothId: string;
  pieces: GroupPiece[];
}

export const GROUP_MIN_PIECES = 2;
export const GROUP_MAX_PIECES = 24;

/** A tooth's local frame in world space. `up` is world up; the other two are horizontal. */
export interface Frame {
  origin: Vec3;
  tangent: Vec3;
  up: Vec3;
  outward: Vec3;
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const round = (v: Vec3): Vec3 => ({ x: r3(v.x), y: r3(v.y), z: r3(v.z) });
function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** World vector → frame coordinates (direction only when `point` is false). */
export function toLocal(v: Vec3, f: Frame, point = true): Vec3 {
  const d = point ? sub(v, f.origin) : v;
  return { x: dot(d, f.tangent), y: dot(d, f.up), z: dot(d, f.outward) };
}

/** Frame coordinates → world vector. */
export function toWorld(v: Vec3, f: Frame, point = true): Vec3 {
  const o = point ? f.origin : { x: 0, y: 0, z: 0 };
  return {
    x: o.x + f.tangent.x * v.x + f.up.x * v.y + f.outward.x * v.z,
    y: o.y + f.tangent.y * v.x + f.up.y * v.y + f.outward.y * v.z,
    z: o.z + f.tangent.z * v.x + f.up.z * v.y + f.outward.z * v.z,
  };
}

/** Express placed pieces in a frame: the saved form of a group. */
export function piecesToGroup(pieces: PlacedJewelry[], frame: Frame): GroupPiece[] {
  return pieces.map((p) => ({
    productId: p.productId,
    ...(p.variantId ? { variantId: p.variantId } : {}),
    ss: p.ss,
    look: p.look,
    rotation: p.rotation,
    ...(p.offset ? { offset: p.offset } : {}),
    at: round(toLocal(p.position, frame)),
    facing: round(unit(toLocal(p.normal, frame, false))),
  }));
}

/** Where each group piece lands in a frame, before re-seating on the enamel. */
export function groupToWorld(pieces: GroupPiece[], frame: Frame): { piece: GroupPiece; position: Vec3; normal: Vec3 }[] {
  return pieces.map((piece) => ({
    piece,
    position: toWorld(piece.at, frame),
    normal: unit(toWorld(piece.facing, frame, false)),
  }));
}

/** Tooth that anchors a selection: the one holding most of its pieces, ties to the first. */
export function anchorToothOf(pieces: Pick<PlacedJewelry, "toothId">[]): string | null {
  const counts = new Map<string, number>();
  for (const p of pieces) counts.set(p.toothId, (counts.get(p.toothId) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id;
      bestN = n;
    }
  }
  return best;
}

/** The indicative shop value of a group's pieces, at the prices last loaded (`gemCatalog.estimateComposition`). */
export function groupEstimateCents(pieces: Pick<GroupPiece, "productId" | "variantId" | "look">[]): number {
  return currentEstimate(pieces).totalMinor;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isVec = (v: unknown): v is Vec3 =>
  !!v && typeof v === "object" && isNum((v as Vec3).x) && isNum((v as Vec3).y) && isNum((v as Vec3).z);
const clampTo = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
/** A group spans a few teeth at most; anything farther is not something the editor produced. */
const MAX_REACH_MM = 40;

/** Rebuild a group arrangement from untrusted JSON; null when nothing usable is left. */
export function sanitizeGroupData(input: unknown): GemGroupData | null {
  if (!input || typeof input !== "object") return null;
  const data = input as Record<string, unknown>;
  if (typeof data.anchorToothId !== "string" || !Array.isArray(data.pieces)) return null;
  const pieces: GroupPiece[] = [];
  for (const raw of data.pieces.slice(0, GROUP_MAX_PIECES)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (!isGemRef(p.productId) || !isVec(p.at) || !isVec(p.facing)) continue;
    if (Math.hypot(p.at.x, p.at.y, p.at.z) > MAX_REACH_MM) continue;
    const look = sanitizeLook(p.look);
    const ss = sanitizeSs(p.ss);
    if (!look || ss === null) continue;
    pieces.push({
      productId: p.productId,
      ...(isGemRef(p.variantId) ? { variantId: p.variantId } : {}),
      ss,
      look,
      rotation: isNum(p.rotation) ? ((p.rotation % 360) + 360) % 360 : 0,
      ...(isNum(p.offset) && p.offset !== 0 ? { offset: clampTo(p.offset, OFFSET_RANGE.min, OFFSET_RANGE.max) } : {}),
      at: { x: p.at.x, y: p.at.y, z: p.at.z },
      facing: unit(p.facing),
    });
  }
  if (pieces.length < GROUP_MIN_PIECES) return null;
  return { version: 2, anchorToothId: data.anchorToothId.slice(0, 4), pieces };
}

/** What a 2D preview needs of a piece. */
export interface PreviewPiece {
  look: GemLook;
  scale: number;
  rotation: number;
  position: Vec3;
}

/** A group laid on its anchor tooth of the reference arch, for its card and the in-studio panel. */
export function groupPreviewPieces(data: GemGroupData): PreviewPiece[] {
  const frame = ARCH_FRAME_BY_ID[data.anchorToothId] ?? ARCH_FRAME_BY_ID["11"];
  const origin = approxLabialPoint(frame.fdi, 0, 0)!.position;
  return groupToWorld(data.pieces, { origin, tangent: frame.tangent, up: { x: 0, y: 1, z: 0 }, outward: frame.outward }).map(
    ({ piece, position }) => ({ look: piece.look, scale: scaleForSs(piece.ss), rotation: piece.rotation, position }),
  );
}
