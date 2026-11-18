/**
 * Photo → Studio creation, the deterministic half of the `studio-photo-design`
 * skill. The agent reads the photo and writes a design spec (which gem, on
 * which tooth, where on its face, in millimetres); this script turns it into
 * the Studio's own pieces on the default "smile" dentition, checks it exactly
 * as the editor does, renders it, and writes the SQL that saves it.
 *
 *   node --import ./register.mjs design.ts faces
 *   node --import ./register.mjs design.ts build <spec.json> --catalog <catalog.json> --out <dir>
 *        [--relax] [--email <owner e-mail> | --update <creation uuid>]
 *
 * Everything geometric comes from the app itself (`smileDentition.ts` for the
 * crowns, `geometry.ts` for the gems' real outlines, the engine's collision
 * and seating rules copied below with their constants), so a design that
 * passes here shows no red frame in the editor.
 */
import * as THREE from "three";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { SMILE_TEETH, buildSmileMeshes } from "../../../../webapp/src/lib/studio3d/smileDentition.ts";
import { footprintCovers, getJewelTemplate, type Footprint } from "../../../../webapp/src/lib/studio3d/geometry.ts";
import { scaleAxes, maxFaceScale } from "../../../../webapp/src/lib/studio3d/pieceScale.ts";
import { scaleForSize, type StudioShape } from "../../../../webapp/src/data/studioEditor.ts";
import { renderViews, type RenderPiece } from "./render.ts";
import { gridImage, photoToFaceFraction } from "./photo.ts";

/* ------------------------------------------------------------ the dentition */

type Frame = (typeof SMILE_TEETH)[number]["frame"];
const FRAMES = new Map<string, Frame>(SMILE_TEETH.map((t) => [t.fdi, t.frame]));
const CROWNS = buildSmileMeshes();
const MATERIAL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const TOOTH_MESHES = CROWNS.map(({ fdi, mesh }) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geo.computeBoundingSphere();
  const m = new THREE.Mesh(geo, MATERIAL);
  m.userData.fdi = fdi;
  m.updateMatrixWorld(true);
  return m;
});
const MESH_BY_FDI = new Map(TOOTH_MESHES.map((m) => [m.userData.fdi as string, m]));
const raycaster = new THREE.Raycaster();
const _Z = new THREE.Vector3(0, 0, 1);

const v3 = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);

/** Face coordinates of a tooth, in mm: x from the crown's centre line toward the viewer's right, y from the biting edge toward the gum. */
function faceToWorldRay(fdi: string, x: number, y: number) {
  const f = FRAMES.get(fdi);
  if (!f) throw new Error(`Unknown tooth ${fdi} (FDI numbers 11–18, 21–28, 31–38, 41–48).`);
  const edge = f.lower ? f.top : f.bottom;
  const gumDir = f.lower ? -1 : 1;
  const out = v3(f.outward).normalize();
  const tan = v3(f.tangent).normalize();
  const base = v3(f.center).addScaledVector(tan, x);
  base.y = edge + gumDir * y;
  return { origin: base.clone().addScaledVector(out, 20), dir: out.clone().negate(), out };
}

interface SurfaceHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}
function surfaceAt(fdi: string, x: number, y: number): SurfaceHit | null {
  const { origin, dir } = faceToWorldRay(fdi, x, y);
  raycaster.set(origin, dir);
  raycaster.far = 40;
  const hit = raycaster.intersectObject(MESH_BY_FDI.get(fdi)!, false)[0];
  if (!hit || !hit.normal) return null;
  const n = hit.normal.clone().normalize();
  if (n.dot(dir) > 0) n.negate();
  return { point: hit.point.clone(), normal: n };
}

/* ------------------------------------------------- the engine's rules, copied */

// engine.ts: SEAT_TOLERANCE, OVERLAP_DEPTH, mountGap(), gemCenterRaw(), blockerAt(), outlinesOverlap().
const SEAT_TOLERANCE = 0.6;
const OVERLAP_DEPTH = 1.5;
const mountGap = (scale: number, offset = 0) => 0.04 + 0.04 * scale + offset;

interface Blocker {
  center: THREE.Vector3;
  reach: number;
  toWorld: THREE.Matrix4;
  toLocal: THREE.Matrix4;
  footprint: Footprint;
}
function blockerFor(p: Piece): Blocker {
  const tpl = getJewelTemplate(p.look.shape);
  const n = v3(p.normal).normalize();
  const center = v3(p.position).addScaledVector(n, tpl.halfDepth * p.scale + mountGap(p.scale));
  const q = new THREE.Quaternion().setFromUnitVectors(_Z, n).multiply(new THREE.Quaternion().setFromAxisAngle(_Z, THREE.MathUtils.degToRad(p.rotation)));
  const axes = scaleAxes(p.look.shape, p.size);
  const toWorld = new THREE.Matrix4().compose(center, q, new THREE.Vector3(axes.x, axes.y, axes.z));
  return { center, reach: tpl.reach * maxFaceScale(axes), toWorld, toLocal: toWorld.clone().invert(), footprint: tpl.footprint };
}
const _ov = new THREE.Vector3();
function edgeInside(a: Blocker, b: Blocker): boolean {
  const e = a.footprint.edge;
  for (let i = 0; i < e.length; i += 2) {
    _ov.set(e[i], e[i + 1], 0).applyMatrix4(a.toWorld).applyMatrix4(b.toLocal);
    if (Math.abs(_ov.z) < OVERLAP_DEPTH && footprintCovers(b.footprint, _ov.x, _ov.y)) return true;
  }
  return false;
}
function outlinesOverlap(a: Blocker, b: Blocker): boolean {
  if (a.center.distanceTo(b.center) >= a.reach + b.reach) return false;
  return edgeInside(a, b) || edgeInside(b, a);
}
/** engine.seatedAt(): the enamel of a tooth lies right under the spot, along its normal. */
function seatedOn(p: Piece): string | null {
  const n = v3(p.normal).normalize();
  const from = SEAT_TOLERANCE * 2;
  raycaster.set(v3(p.position).addScaledVector(n, from), n.clone().negate());
  raycaster.far = from * 2;
  const h = raycaster.intersectObjects(TOOTH_MESHES, false)[0];
  raycaster.far = Infinity;
  if (!h || Math.abs(h.distance - from) > SEAT_TOLERANCE) return null;
  return h.object.userData.fdi as string;
}
/** Clearance between two outlines, mm (0 when they touch or overlap): the nearest pair of edge points. */
function clearance(a: Blocker, b: Blocker): number {
  if (a.center.distanceTo(b.center) > a.reach + b.reach + 1) return Infinity;
  const ea = a.footprint.edge, eb = b.footprint.edge;
  const pb: THREE.Vector3[] = [];
  for (let j = 0; j < eb.length; j += 4) pb.push(new THREE.Vector3(eb[j], eb[j + 1], 0).applyMatrix4(b.toWorld));
  let best = Infinity;
  const pa = new THREE.Vector3();
  for (let i = 0; i < ea.length; i += 4) {
    pa.set(ea[i], ea[i + 1], 0).applyMatrix4(a.toWorld);
    for (const q of pb) best = Math.min(best, pa.distanceTo(q));
  }
  return best;
}
/** Outline points that hang off their tooth: no enamel of that tooth within reach behind them. */
function spillRatio(p: Piece, b: Blocker): number {
  const e = b.footprint.edge;
  const n = v3(p.normal).normalize();
  const mesh = MESH_BY_FDI.get(p.toothId)!;
  let off = 0, total = 0;
  const pt = new THREE.Vector3();
  for (let i = 0; i < e.length; i += 6) {
    pt.set(e[i], e[i + 1], 0).applyMatrix4(b.toWorld);
    raycaster.set(pt.clone().addScaledVector(n, 1), n.clone().negate());
    raycaster.far = 3.2;
    const h = raycaster.intersectObject(mesh, false)[0];
    total++;
    if (!h) off++;
  }
  raycaster.far = Infinity;
  return total ? off / total : 0;
}

/* ---------------------------------------------------------------- the spec */

interface Look {
  shape: StudioShape;
  material: string;
  color: string;
  effect: string;
}
type Size = { ss: number } | { mm: number[] };
interface CatalogGem {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  look: Look;
  sizes: Size[];
}
interface Piece {
  id: string;
  productId: string;
  variantId?: string;
  size: Size;
  look: Look;
  toothId: string;
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  rotation: number;
  scale: number;
}
interface Placed {
  label: string;
  gem: CatalogGem;
  size: Size;
  tooth: string;
  x: number;
  y: number;
  rot: number;
  /** Original spot, to report how far `--relax` moved it. */
  x0: number;
  y0: number;
  piece?: Piece;
}

type XY = [number, number];
interface Common {
  gem: string;
  size: string;
  rot?: number | "tangent";
  label?: string;
  /** Move the whole entry by [dx, dy] mm on its face once placed — to pull a group off a flank, keep the motif's shape. */
  shift?: XY;
}
interface SingleEntry extends Common {
  tooth: string;
  at?: XY;
  uv?: XY;
  /** Pixel position in the photo; needs the tooth's corners in `photo.teeth`. */
  px?: XY;
  /** Turn the piece so its long axis (a star's arm, a drop's point) points at this pixel of the photo. */
  towardPx?: XY;
}
interface PointsEntry extends Common {
  points: { tooth: string; px: XY[] };
}
interface LineEntry extends Common {
  line: { tooth: string; from?: XY; to?: XY; fromPx?: XY; toPx?: XY; count: number };
}
interface ArcEntry extends Common {
  arc: { tooth: string; center?: XY; centerPx?: XY; radius: number | XY; from: number; to: number; count: number };
}
interface MirrorEntry {
  mirror: { label: string; teeth: Record<string, string> };
}
type Entry = SingleEntry | PointsEntry | LineEntry | ArcEntry | MirrorEntry;
interface Spec {
  name: string;
  description?: string;
  motif: string;
  photoView?: { yaw?: number; pitch?: number };
  /** Each decorated tooth's 4 corners in the photo (see `photoToFaceFraction`), for `px` positions. */
  photo?: { file?: string; teeth: Record<string, XY[]> };
  pieces: Entry[];
}

function parseSize(s: string): Size {
  const t = s.trim().toLowerCase();
  let m = /^ss\s*(\d+)$/.exec(t);
  if (m) return { ss: Number(m[1]) };
  m = /^(\d+(?:\.\d+)?)\s*mm$/.exec(t);
  if (m) return { mm: [Number(m[1])] };
  m = /^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)(?:\s*mm)?$/.exec(t);
  if (m) return { mm: [Number(m[1]), Number(m[2])] };
  throw new Error(`Size "${s}": write ss5, 3mm or 2x4.`);
}
const sizeKey = (s: Size) => ("ss" in s ? `ss${s.ss}` : s.mm.join("x") + "mm");

/** Half extents of a face, in mm: how far x may go each way, how tall the crown is. */
function faceExtent(fdi: string) {
  const f = FRAMES.get(fdi)!;
  return { left: f.alongMinus, right: f.alongPlus, height: f.top - f.bottom };
}

/**
 * The rotation that lays a piece's long axis (up at rotation 0) along the face
 * direction (dx, dy) — x to the viewer's right, y toward the gum. On a lower
 * tooth "toward the gum" is world down, and rotations are read seen from the
 * front around world up, so the y component flips there.
 */
function axisRotation(tooth: string, dx: number, dy: number): number {
  const wy = FRAMES.get(tooth)!.lower ? -dy : dy;
  return (Math.atan2(wy, dx) * 180) / Math.PI - 90;
}

function expand(spec: Spec, catalog: Map<string, CatalogGem>): Placed[] {
  const out: Placed[] = [];
  /** A photo pixel → mm on the tooth face, through the tooth's corners in the photo. */
  const fromPx = (tooth: string, px: XY): XY => {
    const quad = spec.photo?.teeth?.[tooth];
    if (!quad) throw new Error(`Pixel position on ${tooth}: add its 4 corners to "photo.teeth".`);
    const { s, t } = photoToFaceFraction(quad, px);
    const f = faceExtent(tooth);
    if (s < -0.15 || s > 1.15 || t < -0.15 || t > 1.15) console.warn(`! ${tooth} px ${px.join(",")} falls outside its corners (s ${s.toFixed(2)}, t ${t.toFixed(2)})`);
    return [-f.left + s * (f.left + f.right), t * f.height];
  };
  const gemOf = (c: Common) => {
    const g = catalog.get(c.gem);
    if (!g) throw new Error(`Gem "${c.gem}" is not in the catalogue file (keys: ${[...catalog.keys()].join(", ")}).`);
    const size = parseSize(c.size);
    if (!g.sizes.some((s) => sizeKey(s) === sizeKey(size)))
      throw new Error(`${g.name}: size ${c.size} is not sold (sizes: ${g.sizes.map(sizeKey).join(", ")}).`);
    return { gem: g, size };
  };
  const push = (c: Common, tooth: string, x: number, y: number, rot: number) => {
    const { gem, size } = gemOf(c);
    const [dx, dy] = c.shift ?? [0, 0];
    out.push({ label: c.label ?? "", gem, size, tooth, x: x + dx, y: y + dy, rot, x0: x + dx, y0: y + dy });
  };
  for (const e of spec.pieces) {
    if ("mirror" in e) {
      const src = out.filter((p) => p.label === e.mirror.label);
      if (!src.length) throw new Error(`mirror: no piece labelled "${e.mirror.label}" before it.`);
      for (const p of src) {
        const to = e.mirror.teeth[p.tooth];
        if (!to) continue;
        out.push({ ...p, label: `${p.label}·miroir`, tooth: to, x: -p.x, x0: -p.x, rot: -p.rot });
      }
    } else if ("points" in e) {
      for (const px of e.points.px) {
        const [x, y] = fromPx(e.points.tooth, px);
        push(e, e.points.tooth, x, y, typeof e.rot === "number" ? e.rot : 0);
      }
    } else if ("line" in e) {
      const { tooth, count } = e.line;
      const from = e.line.fromPx ? fromPx(tooth, e.line.fromPx) : e.line.from;
      const to = e.line.toPx ? fromPx(tooth, e.line.toPx) : e.line.to;
      if (!from || !to) throw new Error(`line on ${tooth}: give from/to (mm) or fromPx/toPx.`);
      const along = axisRotation(tooth, to[0] - from[0], to[1] - from[1]);
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const rot = e.rot === "tangent" ? along : (e.rot ?? 0);
        push(e, tooth, from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, rot);
      }
    } else if ("arc" in e) {
      const { tooth, radius, from, to, count } = e.arc;
      const center = e.arc.centerPx ? fromPx(tooth, e.arc.centerPx) : e.arc.center;
      if (!center) throw new Error(`arc on ${tooth}: give center (mm) or centerPx.`);
      const [rx, ry] = typeof radius === "number" ? [radius, radius] : radius;
      const closed = Math.abs(to - from) >= 360;
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : closed ? i / count : i / (count - 1);
        const a = ((from + (to - from) * t) * Math.PI) / 180;
        // The path's direction at this angle, on the face: (−sin a·rx, cos a·ry), turning the same way as the angles.
        const sign = to >= from ? 1 : -1;
        const rot = e.rot === "tangent" ? axisRotation(tooth, -Math.sin(a) * rx * sign, Math.cos(a) * ry * sign) : (e.rot ?? 0);
        push(e, tooth, center[0] + rx * Math.cos(a), center[1] + ry * Math.sin(a), rot);
      }
    } else {
      let x: number, y: number;
      if (e.at) [x, y] = e.at;
      else if (e.px) [x, y] = fromPx(e.tooth, e.px);
      else if (e.uv) {
        const f = faceExtent(e.tooth);
        x = e.uv[0] * (e.uv[0] < 0 ? f.left : f.right);
        y = e.uv[1] * f.height;
      } else throw new Error(`Piece on ${e.tooth}: give "at": [x, y] in mm (or "uv").`);
      let rot = typeof e.rot === "number" ? e.rot : 0;
      if (e.towardPx) {
        const [tx, ty] = fromPx(e.tooth, e.towardPx);
        rot = axisRotation(e.tooth, tx - x, ty - y) + (typeof e.rot === "number" ? e.rot : 0);
      }
      push(e, e.tooth, x, y, rot);
    }
  }
  return out;
}

/**
 * The engine turns a piece around its normal from world up (`poseObject`):
 * 0 = the outline's long axis vertical (a raindrop's point up, as in the
 * library), positive = counter-clockwise seen from the front — the spec's
 * convention too, upper and lower teeth alike.
 */
const engineRotation = (rot: number) => ((rot % 360) + 360) % 360;

function place(p: Placed): Piece | null {
  const hit = surfaceAt(p.tooth, p.x, p.y);
  if (!hit) return null;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    id: p.piece?.id ?? randomBytes(4).toString("hex"),
    productId: p.gem.productId,
    ...(p.gem.variantId ? { variantId: p.gem.variantId } : {}),
    size: p.size,
    look: p.gem.look,
    toothId: p.tooth,
    position: { x: r3(hit.point.x), y: r3(hit.point.y), z: r3(hit.point.z) },
    normal: { x: r3(hit.normal.x), y: r3(hit.normal.y), z: r3(hit.normal.z) },
    rotation: engineRotation(p.rot),
    scale: scaleForSize(p.size as never),
  };
}

/* ------------------------------------------------------------ the checks */

interface Issue {
  level: "error" | "warning" | "info";
  pieces: number[];
  text: string;
}
function check(placed: Placed[]): { issues: Issue[]; blockers: (Blocker | null)[] } {
  const issues: Issue[] = [];
  const blockers = placed.map((p) => (p.piece ? blockerFor(p.piece) : null));
  placed.forEach((p, i) => {
    if (!p.piece) {
      issues.push({ level: "error", pieces: [i], text: `hors de la dent ${p.tooth} (x ${p.x.toFixed(2)}, y ${p.y.toFixed(2)} mm ne touche pas l'émail)` });
      return;
    }
    const seat = seatedOn(p.piece);
    if (!seat) issues.push({ level: "error", pieces: [i], text: "ne repose pas sur l'émail (l'éditeur l'encadrera en rouge)" });
    else if (seat !== p.tooth) issues.push({ level: "warning", pieces: [i], text: `repose sur la dent ${seat}, pas sur la ${p.tooth}` });
    const spill = spillRatio(p.piece, blockers[i]!);
    if (spill > 0.08) issues.push({ level: "warning", pieces: [i], text: `déborde du bord de la dent (${Math.round(spill * 100)} % du contour dans le vide)` });
    const out = v3(FRAMES.get(p.tooth)!.outward);
    const facing = (Math.acos(Math.min(1, v3(p.piece.normal).dot(out))) * 180) / Math.PI;
    if (facing > 42) issues.push({ level: "warning", pieces: [i], text: `posée sur le flanc (${Math.round(facing)}° de la face) : peu visible de face, souvent trop près du bord` });
  });
  for (let a = 0; a < placed.length; a++)
    for (let b = a + 1; b < placed.length; b++) {
      const A = blockers[a], B = blockers[b];
      if (!A || !B) continue;
      if (outlinesOverlap(A, B)) issues.push({ level: "error", pieces: [a, b], text: "se chevauchent (l'éditeur les encadrera en rouge)" });
      else if (placed[a].tooth === placed[b].tooth && clearance(A, B) < 0.12) issues.push({ level: "info", pieces: [a, b], text: "bord à bord (permis, mais vérifier que c'est voulu)" });
    }
  placed.forEach((p, i) => {
    const moved = Math.hypot(p.x - p.x0, p.y - p.y0);
    if (moved > 0.05) issues.push({ level: moved > 0.8 ? "warning" : "info", pieces: [i], text: `déplacée de ${moved.toFixed(2)} mm par --relax` });
  });
  return { issues, blockers };
}

/** Push overlapping or spilling pieces apart, a little at a time, on their own tooth face. */
function relax(placed: Placed[], rounds = 80, step = 0.05) {
  for (let r = 0; r < rounds; r++) {
    placed.forEach((p) => (p.piece = place(p) ?? undefined));
    const blockers = placed.map((p) => (p.piece ? blockerFor(p.piece) : null));
    let moved = false;
    for (let a = 0; a < placed.length; a++)
      for (let b = a + 1; b < placed.length; b++) {
        const A = blockers[a], B = blockers[b];
        if (!A || !B || !outlinesOverlap(A, B)) continue;
        const d = B.center.clone().sub(A.center);
        for (const [i, sign] of [[a, -1], [b, 1]] as const) {
          const f = FRAMES.get(placed[i].tooth)!;
          const dx = d.dot(v3(f.tangent)) * sign, dy = d.y * sign * (f.lower ? -1 : 1);
          const len = Math.hypot(dx, dy) || 1;
          placed[i].x += (dx / len) * step;
          placed[i].y += (dy / len) * step;
        }
        moved = true;
      }
    placed.forEach((p, i) => {
      const B = blockers[i];
      if (!p.piece || !B) {
        // Off the tooth: walk back toward the middle of the face.
        const h = faceExtent(p.tooth).height;
        p.x -= Math.sign(p.x) * step;
        p.y += Math.sign(h / 2 - p.y) * step;
        moved = true;
      } else if (spillRatio(p.piece, B) > 0.08) {
        const h = faceExtent(p.tooth).height;
        p.x -= Math.sign(p.x) * step;
        p.y += Math.sign(h / 2 - p.y) * step * 0.5;
        moved = true;
      }
    });
    if (!moved) break;
  }
  placed.forEach((p) => (p.piece = place(p) ?? undefined));
}

/* --------------------------------------------------------------- commands */

function faces() {
  console.log("dent  largeur  hauteur  zone plate*  (mm)   *largeur où la face regarde à moins de 35° de l'avant, à mi-hauteur");
  for (const t of SMILE_TEETH) {
    const f = t.frame;
    const h = f.top - f.bottom;
    let lo = Infinity, hi = -Infinity;
    for (let x = -f.alongMinus; x <= f.alongPlus; x += 0.1) {
      const s = surfaceAt(t.fdi, x, h / 2);
      if (s && s.normal.dot(v3(f.outward)) > Math.cos((35 * Math.PI) / 180)) {
        lo = Math.min(lo, x);
        hi = Math.max(hi, x);
      }
    }
    const flat = hi > lo ? `${lo.toFixed(1)} … ${hi.toFixed(1)}` : "—";
    console.log(`${t.fdi}    ${(f.alongMinus + f.alongPlus).toFixed(1).padStart(5)}    ${h.toFixed(1).padStart(5)}    ${flat}`);
  }
}

function sqlString(s: string) {
  return `'${s.replace(/'/g, "''")}'`;
}

function build(args: string[]) {
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const specPath = args[0];
  const catalogPath = opt("--catalog");
  const outDir = resolve(opt("--out") ?? "out");
  if (!specPath || !catalogPath) throw new Error("usage: build <spec.json> --catalog <catalog.json> --out <dir> [--relax] [--email <e-mail> | --update <uuid>]");
  const spec = JSON.parse(readFileSync(specPath, "utf8")) as Spec;
  if (!spec.motif || spec.motif.trim().length < 20) throw new Error('The spec needs a "motif": what the design represents and how it is built (see SKILL.md, step 2).');
  const catalogRows = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogGem[];
  const catalog = new Map(catalogRows.map((g) => [g.key, g]));

  const placed = expand(spec, catalog);
  if (args.includes("--relax")) relax(placed);
  else placed.forEach((p) => (p.piece = place(p) ?? undefined));
  const { issues } = check(placed);

  mkdirSync(outDir, { recursive: true });
  const pieces = placed.flatMap((p) => (p.piece ? [p.piece] : []));
  const scene = { version: 2, model: "smile", modelShade: "porcelain", lightPreset: "studio", camera: null, pieces, groups: [] };
  writeFileSync(join(outDir, "scene.json"), JSON.stringify(scene, null, 1));

  const flagged = new Set(issues.filter((i) => i.level !== "info").flatMap((i) => i.pieces));
  const renderPieces: RenderPiece[] = placed.flatMap((p, i) => (p.piece ? [{ piece: p.piece, flagged: flagged.has(i), index: i }] : []));
  const views = renderViews(CROWNS, renderPieces, spec.photoView);
  for (const [file, png] of Object.entries(views)) writeFileSync(join(outDir, file), png);

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  const name = (i: number) => `#${i} ${placed[i].gem.key} ${sizeKey(placed[i].size)} sur ${placed[i].tooth}${placed[i].label ? ` (${placed[i].label})` : ""}`;
  const lines = [
    `# ${spec.name}`,
    "",
    `Motif : ${spec.motif}`,
    "",
    `${pieces.length} pièces posées sur ${placed.length} — ${errors.length} erreur(s), ${warnings.length} avertissement(s).`,
    "",
    "## Problèmes",
    ...(issues.length ? issues.map((i) => `- **${i.level}** — ${i.pieces.map(name).join(" + ")} : ${i.text}`) : ["- aucun"]),
    "",
    "## Pièces",
    "| # | gemme | taille | dent | x mm | y mm | rotation | label |",
    "|---|---|---|---|---|---|---|---|",
    ...placed.map((p, i) => `| ${i} | ${p.gem.name} | ${sizeKey(p.size)} | ${p.tooth} | ${p.x.toFixed(2)} | ${p.y.toFixed(2)} | ${p.rot.toFixed(0)}° | ${p.label} |`),
    "",
    "## Gemmes à prévoir",
    ...Object.entries(
      placed.reduce<Record<string, number>>((acc, p) => {
        const k = `${p.gem.name} ${sizeKey(p.size)}`;
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([k, n]) => `- ${n} × ${k}`),
    "",
    "Aperçus : preview.png (face, gros plan, trois-quarts gauche, trois-quarts droit)" + (spec.photoView ? ", preview-photo.png (angle de la photo)" : "") + ". Pièces signalées en rouge.",
  ];
  writeFileSync(join(outDir, "report.md"), lines.join("\n"));

  const email = opt("--email");
  const update = opt("--update");
  const sceneSql = `${sqlString(JSON.stringify(scene))}::jsonb`;
  let sql = "";
  if (update) {
    if (!/^[0-9a-f-]{36}$/.test(update)) throw new Error("--update takes the creation's uuid.");
    sql = `update public.creations set scene_data = ${sceneSql}, name = ${sqlString(spec.name)}, description = ${sqlString(spec.description ?? "")} where id = '${update}'\nreturning id, name, element_count;`;
  } else if (email) {
    sql = `insert into public.creations (user_id, name, description, scene_data, last_opened_at)\nselect u.id, ${sqlString(spec.name)}, ${sqlString(spec.description ?? "")}, ${sceneSql}, now()\nfrom auth.users u where lower(u.email) = lower(${sqlString(email)})\nreturning id, name, element_count;`;
  }
  if (sql) writeFileSync(join(outDir, "creation.sql"), sql);

  console.log(lines.slice(4, 9 + issues.length).join("\n"));
  console.log(`\n→ ${outDir}`);
  process.exitCode = errors.length ? 2 : 0;
}

/** Audit a saved creation (its `scene_data`, or just its pieces) with the editor's rules, and render it. */
function checkScene(args: string[]) {
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const raw = JSON.parse(readFileSync(args[0], "utf8"));
  const pieces: Piece[] = Array.isArray(raw) ? raw : raw.pieces;
  if (raw.model && raw.model !== "smile") console.warn(`! scene made on the "${raw.model}" model: checked on "smile", as the editor re-seats it.`);
  const placed: Placed[] = pieces.map((p) => ({
    label: "",
    gem: { key: p.look.shape + (p.look.color ?? ""), productId: p.productId, variantId: p.variantId ?? null, name: `${p.look.shape} ${p.look.color}`, look: p.look, sizes: [p.size] },
    size: p.size,
    tooth: p.toothId,
    x: 0,
    y: 0,
    rot: p.rotation,
    x0: 0,
    y0: 0,
    piece: p,
  }));
  const { issues } = check(placed);
  const outDir = resolve(opt("--out") ?? "out");
  mkdirSync(outDir, { recursive: true });
  const flagged = new Set(issues.filter((i) => i.level !== "info").flatMap((i) => i.pieces));
  for (const [file, png] of Object.entries(renderViews(CROWNS, placed.map((p, i) => ({ piece: p.piece!, flagged: flagged.has(i), index: i })))))
    writeFileSync(join(outDir, file), png);
  const name = (i: number) => `#${i} ${placed[i].gem.name} ${sizeKey(placed[i].size)} sur ${placed[i].tooth}`;
  console.log(`${pieces.length} pièces — ${issues.filter((i) => i.level === "error").length} erreur(s), ${issues.filter((i) => i.level === "warning").length} avertissement(s)`);
  for (const i of issues) console.log(`- ${i.level} — ${i.pieces.map(name).join(" + ")} : ${i.text}`);
  console.log(`→ ${outDir}`);
}

async function grid(args: string[]) {
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const crop = opt("--crop")?.split(",").map(Number) as [number, number, number, number] | undefined;
  const r = await gridImage(args[0], opt("--out") ?? "grid.png", { crop, step: opt("--step") ? Number(opt("--step")) : undefined });
  console.log(`photo ${r.width}×${r.height} px, grid every ${r.step} px (labels every ${r.step * 2}), zoom ×${r.zoom.toFixed(2)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "faces") faces();
else if (cmd === "build") build(rest);
else if (cmd === "check") checkScene(rest);
else if (cmd === "grid") await grid(rest);
else console.log("commands: faces | check <scene.json> [--out dir] | grid <photo> [--crop x,y,w,h] [--out grid.png] | build <spec.json> --catalog <catalog.json> --out <dir> [--relax] [--email <e-mail> | --update <uuid>]");
