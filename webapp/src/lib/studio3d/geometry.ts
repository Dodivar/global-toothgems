import * as THREE from "three";
import type { GemLook, StudioShape, ToothSpec } from "../../data/studioEditor";
import { ss01 } from "./math";

/**
 * Procedural geometry and materials of the 3D Studio: the teeth of the
 * reference arch, the outlines of the shop's gems, and their materials.
 *
 * Templates and materials are cached per shape and per look, because a
 * design reuses the same few dozen of them. `disposeGeometryCaches` releases
 * them when the editor unmounts, so a later visit starts from fresh GPU
 * resources instead of reusing ones a disposed renderer already freed.
 */

/* ---- materials: one per look (crystal or metal, tint, effect) ---- */
type LookMaterial = Pick<GemLook, "material" | "color" | "effect">;

export function matKeyFor(look: LookMaterial): string {
  return `${look.material}|${look.color}|${look.effect}`;
}

const materialCache = new Map<string, THREE.MeshPhysicalMaterial>();
export function getJewelMaterial(look: LookMaterial): THREE.MeshPhysicalMaterial {
  const key = matKeyFor(look);
  let m = materialCache.get(key);
  if (m) return m;
  const iridescent = look.effect === "iridescent";
  const hsl = new THREE.Color(look.color).getHSL({ h: 0, s: 0, l: 0 });
  m =
    look.material === "metal"
      ? new THREE.MeshPhysicalMaterial({
          color: look.color,
          metalness: 1,
          // white gold and chrome read better a touch less glossy than yellow gold
          roughness: hsl.s < 0.2 ? 0.22 : 0.15,
          envMapIntensity: 1.7,
        })
      : new THREE.MeshPhysicalMaterial({
          color: look.color,
          metalness: 0,
          roughness: 0.05,
          transmission: 0.92,
          thickness: 1.6,
          ior: 2.1,
          dispersion: iridescent ? 0.3 : 0.12,
          attenuationColor: new THREE.Color(look.color),
          attenuationDistance: 2.4,
          envMapIntensity: 2.4,
          specularIntensity: 1.1,
          clearcoat: 0.8,
          clearcoatRoughness: 0.06,
          // AB / Shimmer / Vitrail coatings: a thin-film rainbow over the tint
          ...(iridescent ? { iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 620] as [number, number] } : {}),
        });
  materialCache.set(key, m);
  return m;
}

export function createToothGeometry(spec: ToothSpec): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 40, 28);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const v = new THREE.Vector3();
  const cCerv = new THREE.Color(0xe6d7bb),
    cWhite = new THREE.Color(0xffffff);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const ny = v.y,
      up = Math.max(0, ny),
      down = Math.max(0, -ny);
    let wE = spec.wHalf * (1 - spec.cervical * up);
    let dE = spec.dHalf;
    if (spec.incisal) dE *= 1 - spec.incisal * Math.pow(down, 1.4);
    if (spec.tip) {
      const f = down * down;
      wE *= 1 - spec.tip * f;
      dE *= 1 - spec.tip * 0.55 * f;
    }
    const dLab = dE * (1 + (spec.labial ?? 0) * Math.max(0, v.z));
    const dz = v.z >= 0 ? dLab : dE * 0.85;
    let x = 0,
      z = 0;
    const ax = Math.abs(v.x) / wE,
      az = Math.abs(v.z) / dz;
    const denom = Math.pow(Math.pow(ax, spec.p) + Math.pow(az, spec.p), 1 / spec.p);
    if (denom > 1e-6) {
      const t = 1 / denom;
      x = v.x * t;
      z = v.z * t;
    }
    pos.setXYZ(i, x, ny * spec.hHalf, z);
    const k = ss01(((ny + 1) / 2) * 0.9 + 0.05); // warmer toward the cervix (top)
    colors.push(cCerv.r + (cWhite.r - cCerv.r) * k, cCerv.g + (cWhite.g - cCerv.g) * k, cCerv.b + (cWhite.b - cCerv.b) * k);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export interface JewelTemplate {
  parts: THREE.BufferGeometry[];
  halfDepth: number;
  radius: number;
  /** Farthest silhouette point from the piece's centre: the collision broad phase. */
  reach: number;
  footprint: Footprint;
}

/**
 * The silhouette of a piece seen from the front (its local XY plane),
 * rasterised on a fine grid. Collision tests the real outlines against each
 * other instead of bounding circles, so pieces can sit edge to edge exactly as
 * they do on a real tooth — a leaf against a leaf, a stone against a stone.
 */
export interface Footprint {
  cell: number;
  minX: number;
  minY: number;
  cols: number;
  rows: number;
  /** 1 = the silhouette covers this cell. */
  mask: Uint8Array;
  /** Centres of the covered cells on the silhouette's edge, as x, y pairs. */
  edge: Float32Array;
}
/** Footprint grid step, in template units (pieces are ~2 units across). */
const FOOTPRINT_CELL = 0.035;

function buildFootprint(parts: THREE.BufferGeometry[], box: THREE.Box3): Footprint {
  const cell = FOOTPRINT_CELL;
  const minX = box.min.x - cell,
    minY = box.min.y - cell;
  const cols = Math.ceil((box.max.x - minX) / cell) + 2,
    rows = Math.ceil((box.max.y - minY) / cell) + 2;
  const mask = new Uint8Array(cols * rows);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (const g of parts) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const idx = g.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i);
      b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1);
      c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2);
      const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
      if (Math.abs(area) < 1e-9) continue; // edge-on in XY: covers nothing
      const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x, c.x) - minX) / cell));
      const c1 = Math.min(cols - 1, Math.ceil((Math.max(a.x, b.x, c.x) - minX) / cell));
      const r0 = Math.max(0, Math.floor((Math.min(a.y, b.y, c.y) - minY) / cell));
      const r1 = Math.min(rows - 1, Math.ceil((Math.max(a.y, b.y, c.y) - minY) / cell));
      for (let r = r0; r <= r1; r++) {
        const y = minY + (r + 0.5) * cell;
        for (let q = c0; q <= c1; q++) {
          if (mask[r * cols + q]) continue;
          const x = minX + (q + 0.5) * cell;
          const w0 = (b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y);
          const w1 = (c.x - b.x) * (y - b.y) - (x - b.x) * (c.y - b.y);
          const w2 = (a.x - c.x) * (y - c.y) - (x - c.x) * (a.y - c.y);
          if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) mask[r * cols + q] = 1;
        }
      }
    }
  }
  const edge: number[] = [];
  const at = (q: number, r: number) => (q < 0 || r < 0 || q >= cols || r >= rows ? 0 : mask[r * cols + q]);
  for (let r = 0; r < rows; r++)
    for (let q = 0; q < cols; q++)
      if (at(q, r) && (!at(q - 1, r) || !at(q + 1, r) || !at(q, r - 1) || !at(q, r + 1)))
        edge.push(minX + (q + 0.5) * cell, minY + (r + 0.5) * cell);
  return { cell, minX, minY, cols, rows, mask, edge: new Float32Array(edge) };
}
/** Is the local point (x, y) inside the footprint's silhouette? */
export function footprintCovers(fp: Footprint, x: number, y: number): boolean {
  const q = Math.floor((x - fp.minX) / fp.cell),
    r = Math.floor((y - fp.minY) / fp.cell);
  if (q < 0 || r < 0 || q >= fp.cols || r >= fp.rows) return false;
  return fp.mask[r * fp.cols + q] === 1;
}

/**
 * Tooth gems are flat-backed: the cut shows on the front, but the side glued
 * to the enamel is a plane. Every vertex behind `cutZ` is pressed onto it.
 */
function flattenBack(g: THREE.BufferGeometry, cutZ: number): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) if (pos.getZ(i) < cutZ) pos.setZ(i, cutZ);
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}
const templateCache = new Map<StudioShape, JewelTemplate>();

const v2 = (pts: number[][]) => pts.map((p) => new THREE.Vector2(p[0], p[1]));

function extrudeJewel(shape: THREE.Shape, depth = 0.3, rounded = false): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    // metal charms are polished and rounded; crystals keep a crisp table and girdle
    bevelThickness: rounded ? 0.16 : 0.1,
    bevelSize: rounded ? 0.1 : 0.07,
    bevelSegments: rounded ? 4 : 2,
    curveSegments: 32,
  });
  g.center();
  // the rear bevel would round the back off: press it onto the back face
  return flattenBack(g, -depth / 2);
}

/** A round wire along a path (open or closed), tapered by `radiusAt(t)` — the polished metal charms. */
function wire(points: THREE.Vector3[], radius: number, closed = false, radiusAt?: (t: number) => number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const tubular = Math.max(48, points.length * 16);
  const radial = 12;
  const g = new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
  if (radiusAt) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const centre = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i <= tubular; i++) {
      const t = i / tubular;
      curve.getPointAt(t, centre);
      const k = radiusAt(t);
      for (let j = 0; j <= radial; j++) {
        const idx = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, idx).sub(centre).multiplyScalar(k).add(centre);
        pos.setXYZ(idx, v.x, v.y, v.z);
      }
    }
  }
  return flattenBack(g, -radius * 0.45);
}

function blob(x: number, y: number, rx: number, ry: number, rz: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 28, 20);
  g.scale(rx, ry, rz);
  g.translate(x, y, 0);
  return flattenBack(g, -rz * 0.45);
}

function starShape(outer: number, inner: number, points = 5): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * r,
      y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}
function starPath(outer: number, inner: number, z = 0): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    out.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
  }
  return out;
}
function heartShape(scale = 1): THREE.Shape {
  const s = new THREE.Shape();
  const k = (x: number, y: number): [number, number] => [x * scale, y * scale];
  s.moveTo(...k(0, -0.85));
  s.bezierCurveTo(...k(-0.95, -0.35), ...k(-1.2, 0.35), ...k(-0.55, 0.72));
  s.bezierCurveTo(...k(-0.25, 0.9), ...k(-0.1, 0.72), ...k(0, 0.45));
  s.bezierCurveTo(...k(0.1, 0.72), ...k(0.25, 0.9), ...k(0.55, 0.72));
  s.bezierCurveTo(...k(1.2, 0.35), ...k(0.95, -0.35), ...k(0, -0.85));
  return s;
}
function heartPath(): THREE.Vector3[] {
  const pts = heartShape(1).getSpacedPoints(48);
  pts.pop(); // closed: the first point comes back on its own
  return pts.map((p) => new THREE.Vector3(p.x, p.y, 0));
}

/** The outline of each shape, as the shop's photos show it. Sizes are normalised afterwards. */
function buildParts(shape: StudioShape): THREE.BufferGeometry[] {
  switch (shape) {
    case "round":
      // faceted dome on a flat base, cut just behind the girdle
      return [flattenBack(new THREE.IcosahedronGeometry(0.8, 1).scale(1, 1, 0.62), -0.06)];
    case "baguette":
      // a 1:2 step-cut rectangle with barely clipped corners
      return [extrudeJewel(new THREE.Shape(v2([[0.42, 1], [-0.42, 1], [-0.5, 0.92], [-0.5, -0.92], [-0.42, -1], [0.42, -1], [0.5, -0.92], [0.5, 0.92]])), 0.24)];
    case "square":
      return [extrudeJewel(new THREE.Shape(v2([[0.84, 0.92], [-0.84, 0.92], [-0.92, 0.84], [-0.92, -0.84], [-0.84, -0.92], [0.84, -0.92], [0.92, -0.84], [0.92, 0.84]])), 0.26)];
    case "heart":
      return [extrudeJewel(heartShape(), 0.3)];
    case "open-heart":
      return [wire(heartPath(), 0.13, true)];
    case "kite":
      // Swarovski "Diamond Shape": a flat lozenge, taller than wide
      return [extrudeJewel(new THREE.Shape(v2([[0, 1], [0.6, 0], [0, -1], [-0.6, 0]])), 0.3)];
    case "navette":
      // an elongated hexagon pointed at both ends
      return [extrudeJewel(new THREE.Shape(v2([[0, 1], [0.5, 0.5], [0.5, -0.5], [0, -1], [-0.5, -0.5], [-0.5, 0.5]])), 0.3)];
    case "raindrop": {
      // slim drop: pointed tip up, round foot
      const s = new THREE.Shape();
      s.moveTo(0, 1);
      s.bezierCurveTo(0.08, 0.7, 0.34, -0.2, 0.33, -0.66);
      s.bezierCurveTo(0.32, -1.02, -0.32, -1.02, -0.33, -0.66);
      s.bezierCurveTo(-0.34, -0.2, -0.08, 0.7, 0, 1);
      return [extrudeJewel(s, 0.28)];
    }
    case "triangle":
      return [extrudeJewel(new THREE.Shape(v2([[0, 0.95], [-0.84, -0.62], [0.84, -0.62]])), 0.26)];
    case "rivoli-star":
      return [extrudeJewel(starShape(1, 0.46), 0.3)];
    case "starflower": {
      // a chubby star with round points
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        const r = 0.8 + 0.2 * Math.cos(5 * (a - Math.PI / 2));
        pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
      }
      return [extrudeJewel(new THREE.Shape(pts), 0.3)];
    }
    case "halo-star":
      return [wire(starPath(1, 0.5), 0.12, true)];
    case "bolt":
      return [extrudeJewel(new THREE.Shape(v2([[0.42, 1], [-0.5, -0.08], [-0.04, -0.08], [-0.42, -1], [0.5, 0.1], [0.06, 0.1]])), 0.24, true)];
    case "cherries": {
      const stemL = wire([new THREE.Vector3(-0.36, -0.3, 0), new THREE.Vector3(-0.2, 0.15, 0), new THREE.Vector3(0.12, 0.56, 0)], 0.06);
      const stemR = wire([new THREE.Vector3(0.38, -0.3, 0), new THREE.Vector3(0.3, 0.2, 0), new THREE.Vector3(0.12, 0.56, 0)], 0.06);
      const leaf = new THREE.Shape();
      leaf.moveTo(0.1, 0.58);
      leaf.bezierCurveTo(-0.15, 0.95, -0.55, 0.92, -0.7, 0.78);
      leaf.bezierCurveTo(-0.45, 0.6, -0.1, 0.52, 0.1, 0.58);
      const leafGeo = new THREE.ExtrudeGeometry(leaf, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3, curveSegments: 24 });
      leafGeo.translate(0, 0, -0.04);
      return [blob(-0.4, -0.58, 0.34, 0.33, 0.3), blob(0.42, -0.58, 0.34, 0.33, 0.3), stemL, stemR, flattenBack(leafGeo, -0.06)];
    }
    case "snake": {
      const body = [
        [-0.28, -1],
        [0.12, -0.86],
        [0.3, -0.62],
        [0.1, -0.4],
        [-0.26, -0.24],
        [-0.3, 0.02],
        [0.0, 0.18],
        [0.28, 0.36],
        [0.26, 0.6],
        [0.06, 0.74],
      ].map(([x, y]) => new THREE.Vector3(x, y, 0));
      // thin at the tail, full at the neck
      const tube = wire(body, 0.13, false, (t) => 0.35 + 0.65 * Math.min(1, t * 1.6));
      return [tube, blob(0.08, 0.84, 0.17, 0.2, 0.15)];
    }
    case "dachshund": {
      const s = new THREE.Shape();
      const outline = v2([
        [-0.98, 0.42],
        [-0.8, 0.14],
        [-0.3, 0.16],
        [0.3, 0.18],
        [0.48, 0.36],
        [0.62, 0.54],
        [0.8, 0.55],
        [0.97, 0.38],
        [0.99, 0.3],
        [0.86, 0.24],
        [0.66, 0.2],
        [0.55, 0.0],
        [0.5, -0.22],
        [0.5, -0.5],
        [0.36, -0.52],
        [0.34, -0.26],
        [-0.44, -0.26],
        [-0.48, -0.5],
        [-0.62, -0.52],
        [-0.68, -0.2],
        [-0.8, 0.0],
        [-0.86, 0.16],
      ]);
      s.moveTo(outline[0].x, outline[0].y);
      s.splineThru([...outline.slice(1), outline[0]]);
      return [extrudeJewel(s, 0.26, true)];
    }
  }
}

export function getJewelTemplate(shape: StudioShape): JewelTemplate {
  const hit = templateCache.get(shape);
  if (hit) return hit;
  const parts = buildParts(shape);
  const box = new THREE.Box3();
  for (const p of parts) {
    p.computeBoundingBox();
    box.union(p.boundingBox!);
  }
  // Normalise: centre the outline, put the flat back exactly `halfDepth` behind
  // the origin, and make the longest half-side 1 — so a piece's `scale` (half
  // its stone size, in mm) gives its real size whatever the outline.
  const centre = new THREE.Vector3();
  box.getCenter(centre);
  const size = new THREE.Vector3();
  box.getSize(size);
  const k = 2 / Math.max(size.x, size.y);
  for (const p of parts) {
    p.translate(-centre.x, -centre.y, -centre.z);
    p.scale(k, k, k);
    p.computeBoundingBox();
  }
  box.makeEmpty();
  for (const p of parts) box.union(p.boundingBox!);
  box.getSize(size);
  const footprint = buildFootprint(parts, box);
  let reach = 0;
  for (let i = 0; i < footprint.edge.length; i += 2) reach = Math.max(reach, Math.hypot(footprint.edge[i], footprint.edge[i + 1]));
  const tpl = { parts, halfDepth: size.z / 2, radius: Math.max(size.x, size.y) / 2, reach: reach + footprint.cell, footprint };
  templateCache.set(shape, tpl);
  return tpl;
}

/** Release every cached geometry and material (the renderer that used them is gone). */
export function disposeGeometryCaches() {
  materialCache.forEach((m) => m.dispose());
  materialCache.clear();
  templateCache.forEach((tpl) => tpl.parts.forEach((g) => g.dispose()));
  templateCache.clear();
}
