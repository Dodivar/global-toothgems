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
          roughness: 0.02,
          // a little less see-through than glass: the facets, not the tooth behind, make the stone
          transmission: 0.86,
          thickness: 1.2,
          ior: 2.3,
          // the "fire" of a lead crystal: white light split into colour along the facet edges
          dispersion: iridescent ? 0.45 : 0.28,
          attenuationColor: new THREE.Color(look.color),
          attenuationDistance: 1.3,
          envMapIntensity: 3.2,
          specularIntensity: 1,
          specularColor: new THREE.Color(0xffffff),
          clearcoat: 1,
          clearcoatRoughness: 0.02,
          // a faint rainbow film even on plain stones, strong on AB / Shimmer / Vitrail
          iridescence: iridescent ? 1 : 0.22,
          iridescenceIOR: 1.6,
          iridescenceThicknessRange: [180, 620] as [number, number],
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

/**
 * A flat-back crystal: a straight girdle, two stepped rings of crown facets
 * (the upper one zig-zagging so neighbouring facets catch different light),
 * and a table cut as a shallow pyramid instead of one mirror — the many small
 * flat faces are what make a stone sparkle as it moves. The outline is scaled
 * towards its centre for each ring, which suits every convex or star-shaped
 * crystal outline of the library.
 */
function crystalCut(shape: THREE.Shape): THREE.BufferGeometry {
  const raw = shape.extractPoints(5).shape;
  if (raw.length > 1 && raw[0].distanceTo(raw[raw.length - 1]) < 1e-6) raw.pop();
  if (THREE.ShapeUtils.isClockWise(raw)) raw.reverse();
  const n = raw.length;
  const c = new THREE.Vector2();
  raw.forEach((p) => c.add(p));
  c.divideScalar(n);
  const ring = (k: number, z: number, wobble = 0) =>
    raw.map((p, i) => new THREE.Vector3(c.x + (p.x - c.x) * k, c.y + (p.y - c.y) * k, z + (i % 2 ? wobble : -wobble)));
  const girdle = 0.1;
  const back = ring(1, -girdle);
  const rim = ring(1, 0);
  const crown = ring(0.84, 0.13, 0.028);
  const table = ring(0.5, 0.215);
  const apex = new THREE.Vector3(c.x, c.y, 0.255);
  const tri: number[] = [];
  const push = (...v: THREE.Vector3[]) => v.forEach((p) => tri.push(p.x, p.y, p.z));
  const band = (a: THREE.Vector3[], b: THREE.Vector3[]) => {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push(a[i], a[j], b[j]);
      push(a[i], b[j], b[i]);
    }
  };
  band(back, rim); // girdle wall
  band(rim, crown);
  band(crown, table);
  for (let i = 0; i < n; i++) {
    push(table[i], table[(i + 1) % n], apex); // table pyramid
    push(back[(i + 1) % n], back[i], new THREE.Vector3(c.x, c.y, -girdle)); // flat back
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  g.computeVertexNormals(); // non-indexed: every triangle keeps its own flat normal
  return g;
}

/*
 * Measured cuts. The outlines below were traced from the shop's product photos
 * (silhouette half-widths or radii, averaged over the stone's symmetries and
 * simplified to within 0.4 % of its height), and each cut follows the facet
 * layout those photos show instead of the generic `crystalCut`. Same contract
 * as `crystalCut`: a CCW rim at z = 0, a straight girdle wall and a flat back
 * below it, every crown triangle facing +z.
 */
type Push = (...v: THREE.Vector3[]) => void;

function facetMesh(rim: THREE.Vector2[], girdle: number, crown: (push: Push) => void): THREE.BufferGeometry {
  const tri: number[] = [];
  const push: Push = (...v) => v.forEach((p) => tri.push(p.x, p.y, p.z));
  const n = rim.length;
  const c = new THREE.Vector3(0, 0, -girdle);
  rim.forEach((p) => c.set(c.x + p.x / n, c.y + p.y / n, -girdle));
  for (let i = 0; i < n; i++) {
    const a = rim[i],
      b = rim[(i + 1) % n];
    const a0 = new THREE.Vector3(a.x, a.y, -girdle),
      b0 = new THREE.Vector3(b.x, b.y, -girdle);
    push(a0, b0, new THREE.Vector3(b.x, b.y, 0)); // girdle wall
    push(a0, new THREE.Vector3(b.x, b.y, 0), new THREE.Vector3(a.x, a.y, 0));
    push(b0, a0, c); // flat back
  }
  crown(push);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  g.computeVertexNormals(); // non-indexed: flat facets
  return g;
}
const at = (p: THREE.Vector2, z: number) => new THREE.Vector3(p.x, p.y, z);

/** A rim scaled towards `c` by (kx, ky), at height z. */
function scaledRing(rim: THREE.Vector2[], c: THREE.Vector2, kx: number, ky: number, z: number): THREE.Vector3[] {
  return rim.map((p) => new THREE.Vector3(c.x + (p.x - c.x) * kx, c.y + (p.y - c.y) * ky, z));
}
/** Quads between two rings of the same vertex count (outer first), split in two. */
function ringBand(push: Push, a: THREE.Vector3[], b: THREE.Vector3[]) {
  const n = a.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    push(a[i], a[j], b[j]);
    push(a[i], b[j], b[i]);
  }
}

/** A half outline mirrored about the y axis: `half` runs from the top (x = 0) to the bottom (x = 0) on the right. */
function mirrored(half: number[][]): THREE.Vector2[] {
  const right = half.map(([x, y]) => new THREE.Vector2(x, y));
  const left = right.slice(1, -1).reverse().map((p) => new THREE.Vector2(-p.x, p.y));
  // top → right side → foot → left side is clockwise: turn it round, keeping the top first
  const pts = [...right, ...left];
  return [pts[0], ...pts.slice(1).reverse()];
}

/**
 * A five-pointed outline from one half point, traced tip (0, 1) → valley (36°
 * further CCW). Returns the rim (CCW, first point on the top tip) and, for each
 * rim point, the point it belongs to (a valley belongs to the point before it).
 */
function fivefold(halfPoint: number[][]): { rim: THREE.Vector2[]; owner: number[] } {
  const polar = halfPoint.map(([x, y]) => ({ a: Math.atan2(-x, y), r: Math.hypot(x, y) }));
  const rim: THREE.Vector2[] = [];
  const owner: number[] = [];
  const add = (a: number, r: number, k: number) => {
    rim.push(new THREE.Vector2(Math.cos(Math.PI / 2 + a) * r, Math.sin(Math.PI / 2 + a) * r));
    owner.push(k % 5);
  };
  const step = (2 * Math.PI) / 5;
  for (let k = 0; k < 5; k++) {
    for (const p of polar) add(k * step + p.a, p.r, k); // tip k → valley
    for (let i = polar.length - 2; i > 0; i--) add((k + 1) * step - polar[i].a, polar[i].r, k + 1); // valley → before tip k+1
  }
  return { rim, owner };
}

/** Navette: an octagon — tips, shoulders at 60 % of the height, a blunt point mid-side. */
const NAVETTE_HALF = [[0, 1], [0.375, 0.6], [0.515, 0], [0.375, -0.6], [0, -1]];
/** Raindrop: tip up, slim (width 0.286 of the length), widest a third from the foot. */
const RAINDROP_HALF = [
  [0, 1], [0.044, 0.975], [0.086, 0.875], [0.148, 0.675], [0.212, 0.4], [0.249, 0.175], [0.263, 0.05], [0.276, -0.125],
  [0.282, -0.325], [0.281, -0.45], [0.27, -0.6], [0.246, -0.725], [0.212, -0.825], [0.171, -0.9], [0.129, -0.95], [0.097, -0.975], [0, -1],
];
/** Starflower half point: round tip, gently curved flank, broad valley at 0.666 of the tip radius. */
const STARFLOWER_HALF_POINT = [
  [0, 1], [-0.035, 0.996], [-0.068, 0.979], [-0.1, 0.953], [-0.144, 0.906], [-0.188, 0.848], [-0.231, 0.781], [-0.324, 0.609], [-0.352, 0.574], [-0.392, 0.539],
];
/** Rivoli star half point: small tip fillet, straight flank, small valley fillet at 0.503 of the tip radius. */
const RIVOLI_STAR_HALF_POINT = [[0, 1], [-0.026, 0.996], [-0.051, 0.981], [-0.067, 0.963], [-0.082, 0.937], [-0.254, 0.469], [-0.271, 0.433], [-0.295, 0.407]];

/** Heart: wider than tall (1.18), round lobes, a shallow notch at 0.76 of the half-height. */
const HEART_HALF = [
  [0, 0.757], [0.053, 0.763], [0.11, 0.783], [0.299, 0.92], [0.366, 0.954], [0.436, 0.979], [0.53, 0.997], [0.6, 0.999], [0.736, 0.977],
  [0.842, 0.935], [0.94, 0.877], [1.009, 0.817], [1.069, 0.749], [1.117, 0.671], [1.153, 0.587], [1.176, 0.499], [1.183, 0.407], [1.178, 0.316],
  [1.162, 0.226], [1.129, 0.119], [1.095, 0.038], [1.049, -0.055], [0.997, -0.14], [0.933, -0.233], [0.857, -0.329], [0.682, -0.514],
  [0.448, -0.717], [0.302, -0.829], [0.148, -0.933], [0.052, -0.988], [0, -1],
];
/** The heart's table: a pentagon, flat at the top under the notch, pointed towards the tip (listed CCW from the top, as `zip` needs). */
const HEART_TABLE = [[0, 0.5], [-0.17, 0.5], [-0.42, 0.05], [0, -0.47], [0.42, 0.05], [0.17, 0.5]];
/** 18ct snake, traced from its photo: head up right, three bends, the tail tip down. */
const SNAKE_OUTLINE = [
  [0.314, 0.982], [0.260, 0.942], [0.197, 0.848], [0.169, 0.749], [0.173, 0.589], [0.158, 0.562], [0.089, 0.575], [-0.112, 0.686],
  [-0.219, 0.707], [-0.298, 0.703], [-0.382, 0.680], [-0.470, 0.627], [-0.530, 0.555], [-0.568, 0.449], [-0.572, 0.373], [-0.542, 0.259],
  [-0.492, 0.183], [-0.424, 0.130], [-0.348, 0.097], [-0.230, 0.076], [0.165, 0.068], [0.249, 0.040], [0.278, 0.000], [0.274, -0.053],
  [0.222, -0.084], [0.139, -0.080], [-0.188, -0.004], [-0.356, -0.010], [-0.466, -0.068], [-0.509, -0.118], [-0.536, -0.175],
  [-0.546, -0.247], [-0.532, -0.319], [-0.486, -0.407], [-0.420, -0.469], [-0.287, -0.525], [-0.006, -0.565], [0.064, -0.612],
  [0.086, -0.665], [0.076, -0.738], [-0.046, -0.935], [-0.043, -0.977], [-0.013, -1.000], [0.025, -0.998], [0.097, -0.960],
  [0.184, -0.882], [0.224, -0.829], [0.272, -0.700], [0.262, -0.574], [0.204, -0.464], [0.131, -0.402], [0.025, -0.356], [-0.203, -0.300],
  [-0.229, -0.281], [-0.232, -0.255], [-0.211, -0.241], [-0.158, -0.240], [0.203, -0.327], [0.367, -0.313], [0.462, -0.268],
  [0.528, -0.198], [0.562, -0.114], [0.572, 0.011], [0.555, 0.080], [0.513, 0.160], [0.470, 0.209], [0.394, 0.258], [0.177, 0.304],
  [-0.196, 0.307], [-0.260, 0.338], [-0.287, 0.395], [-0.260, 0.434], [-0.184, 0.441], [0.108, 0.357], [0.241, 0.346], [0.348, 0.373],
  [0.439, 0.430], [0.494, 0.490], [0.532, 0.567], [0.553, 0.650], [0.553, 0.764], [0.518, 0.886], [0.473, 0.954], [0.416, 0.994],
  [0.363, 0.998],
];
/** 18ct dachshund, traced from its photo: tail up at the left, head and ear at the right, four short legs. */
const DACHSHUND_OUTLINE = [
  [0.326, 0.670], [0.249, 0.619], [0.183, 0.534], [0.078, 0.291], [0.006, 0.184], [-0.083, 0.117], [-0.190, 0.080], [-0.433, 0.044],
  [-0.536, 0.048], [-0.632, 0.078], [-0.691, 0.129], [-0.716, 0.199], [-0.680, 0.413], [-0.684, 0.471], [-0.702, 0.491], [-0.738, 0.494],
  [-0.816, 0.442], [-0.859, 0.376], [-0.914, 0.199], [-0.987, 0.022], [-1.000, -0.099], [-0.970, -0.192], [-0.862, -0.331],
  [-0.862, -0.368], [-0.890, -0.442], [-0.881, -0.483], [-0.735, -0.652], [-0.687, -0.684], [-0.621, -0.700], [-0.532, -0.693],
  [-0.497, -0.674], [-0.492, -0.652], [-0.503, -0.630], [-0.584, -0.593], [-0.622, -0.530], [-0.628, -0.490], [-0.617, -0.442],
  [-0.587, -0.407], [-0.554, -0.393], [-0.083, -0.420], [0.149, -0.387], [0.182, -0.399], [0.199, -0.427], [0.215, -0.600],
  [0.252, -0.673], [0.289, -0.694], [0.348, -0.700], [0.403, -0.690], [0.444, -0.667], [0.450, -0.634], [0.408, -0.597], [0.400, -0.552],
  [0.484, -0.287], [0.492, -0.155], [0.481, -0.041], [0.499, 0.022], [0.536, 0.064], [0.595, 0.089], [0.812, 0.092], [0.904, 0.115],
  [0.937, 0.136], [0.981, 0.192], [1.000, 0.298], [0.991, 0.328], [0.967, 0.349], [0.849, 0.374], [0.746, 0.432], [0.675, 0.582],
  [0.613, 0.653], [0.525, 0.693], [0.436, 0.698],
];

/** 18ct lightning bolt, traced from its photo: two tapered blades meeting at the zig-zag, tips rounded. */
const BOLT_OUTLINE = [
  [0.480, 0.994], [0.524, 0.981], [0.546, 0.954], [0.550, 0.907], [0.539, 0.872], [0.456, 0.695], [0.173, 0.172], [0.202, 0.154],
  [0.511, 0.143], [0.560, 0.098], [0.553, 0.046], [-0.266, -0.914], [-0.354, -0.988], [-0.415, -0.993], [-0.447, -0.950],
  [-0.443, -0.876], [-0.133, -0.128], [-0.146, -0.115], [-0.498, -0.117], [-0.554, -0.080], [-0.563, -0.050], [-0.555, -0.011],
  [-0.387, 0.193], [0.080, 0.663], [0.350, 0.920], [0.433, 0.980],
];
/** 18ct cherries, traced from their photo: the leaf up left, two stems crossing at the top, two heart-shaped cherries side by side. */
const CHERRIES_OUTLINE = [
  [-0.351, 0.996], [-0.242, 0.993], [-0.099, 0.966], [0.078, 0.886], [0.222, 0.764], [0.356, 0.574], [0.479, 0.648],
  [0.607, 0.691], [0.696, 0.677], [0.757, 0.617], [0.765, 0.573], [0.739, 0.511], [0.686, 0.475], [0.578, 0.440], [0.533, 0.410],
  [0.468, 0.326], [0.444, 0.237], [0.449, 0.089], [0.521, -0.193], [0.543, -0.210], [0.642, -0.227], [0.733, -0.286],
  [0.790, -0.375], [0.825, -0.509], [0.816, -0.627], [0.777, -0.741], [0.695, -0.859], [0.578, -0.952], [0.479, -0.983],
  [0.415, -0.983], [0.336, -0.963], [0.231, -0.889], [0.153, -0.777], [0.073, -0.894], [0.005, -0.948], [-0.119, -0.995],
  [-0.217, -0.998], [-0.365, -0.953], [-0.469, -0.864], [-0.529, -0.775], [-0.578, -0.627], [-0.573, -0.514], [-0.534, -0.405],
  [-0.500, -0.356], [-0.435, -0.302], [-0.311, -0.265], [-0.287, -0.247], [-0.212, -0.040], [-0.160, 0.067], [-0.058, 0.216],
  [0.088, 0.370], [0.148, 0.459], [0.142, 0.478], [0.123, 0.484], [-0.109, 0.425], [-0.360, 0.408], [-0.479, 0.427],
  [-0.612, 0.472], [-0.743, 0.568], [-0.810, 0.662], [-0.825, 0.706], [-0.822, 0.756], [-0.780, 0.825], [-0.731, 0.872],
  [-0.588, 0.949], [-0.415, 0.993],
];
/** The gap the cherries' two stems leave above the fruit. */
const CHERRIES_HOLE = [
  [0.212, 0.171], [0.235, 0.170], [0.246, 0.153], [0.314, -0.104], [0.329, -0.212], [0.207, -0.277], [0.133, -0.373],
  [0.035, -0.289], [-0.084, -0.257], [-0.018, -0.084], [0.033, -0.000], [0.138, 0.123],
];
/** 18ct open heart, traced from its photo: wider than tall, a V notch on the outside, a round inner opening. */
const OPEN_HEART_OUTLINE = [
  [-0.515, 0.920], [-0.397, 0.917], [-0.241, 0.876], [-0.147, 0.826], [-0.009, 0.723], [0.024, 0.730], [0.199, 0.857],
  [0.284, 0.893], [0.454, 0.922], [0.619, 0.900], [0.726, 0.858], [0.828, 0.779], [0.933, 0.633], [0.983, 0.496], [0.998, 0.388],
  [0.983, 0.189], [0.941, 0.061], [0.820, -0.140], [0.683, -0.304], [0.234, -0.754], [0.066, -0.899], [0.024, -0.919],
  [-0.033, -0.917], [-0.113, -0.864], [-0.598, -0.389], [-0.824, -0.137], [-0.908, -0.009], [-0.954, 0.095], [-0.984, 0.200],
  [-0.998, 0.397], [-0.971, 0.534], [-0.913, 0.671], [-0.834, 0.775], [-0.736, 0.853], [-0.642, 0.897],
];
/** The open heart's opening. */
const OPEN_HEART_HOLE = [
  [-0.487, 0.622], [-0.411, 0.624], [-0.298, 0.592], [-0.227, 0.551], [-0.113, 0.447], [-0.052, 0.410], [0.043, 0.412],
  [0.103, 0.447], [0.260, 0.576], [0.411, 0.624], [0.515, 0.617], [0.610, 0.577], [0.667, 0.525], [0.702, 0.468], [0.723, 0.364],
  [0.710, 0.251], [0.680, 0.165], [0.607, 0.043], [0.378, -0.207], [0.061, -0.508], [0.004, -0.548], [-0.142, -0.430],
  [-0.488, -0.092], [-0.621, 0.066], [-0.684, 0.180], [-0.723, 0.340], [-0.702, 0.473], [-0.673, 0.519], [-0.614, 0.574],
  [-0.563, 0.602],
];

/** Step cut: two flat steps of crown facets around a large flat table, as on the navette's photo. */
function navetteCut(): THREE.BufferGeometry {
  const rim = mirrored(NAVETTE_HALF);
  const o = new THREE.Vector2();
  return facetMesh(rim, 0.1, (push) => {
    const r0 = scaledRing(rim, o, 1, 1, 0);
    const r1 = scaledRing(rim, o, 0.8, 0.84, 0.12);
    const table = scaledRing(rim, o, 0.5, 0.6, 0.19);
    ringBand(push, r0, r1);
    ringBand(push, r1, table);
    const top = new THREE.Vector3(0, 0, 0.19);
    for (let i = 0; i < table.length; i++) push(table[i], table[(i + 1) % table.length], top);
  });
}

/**
 * Briolette: a lattice of small facets over the whole drop, rows down its
 * length and columns across its width, each row's columns half a step from
 * the next row's so the facets read as the diamonds of the photo. The crown rises with the local
 * width (on the narrow half-width, or a slim drop would become a ridge).
 */
function raindropCut(): THREE.BufferGeometry {
  // rows closer together at the rounded tip and foot than along the body
  const ROWS = [1, 0.97, 0.9, 0.76, 0.56, 0.36, 0.16, -0.04, -0.24, -0.44, -0.61, -0.75, -0.86, -0.935, -0.98, -1];
  // every other row's columns half a step across, so neighbouring facets make diamonds
  const COLS = [
    [-1, -0.5, 0, 0.5, 1],
    [-1, -0.75, -0.25, 0.25, 0.75, 1],
  ];
  const widest = Math.max(...RAINDROP_HALF.map(([x]) => x));
  const height = widest * 0.62;
  const widthAt = (y: number) => {
    for (let i = 0; i + 1 < RAINDROP_HALF.length; i++) {
      const [x0, y0] = RAINDROP_HALF[i],
        [x1, y1] = RAINDROP_HALF[i + 1];
      if (y <= y0 && y >= y1) return x0 + ((x1 - x0) * (y0 - y)) / (y0 - y1 || 1);
    }
    return 0;
  };
  const grid = ROWS.map((y, i) => {
    const w = widthAt(y);
    const lift = height * Math.sqrt(w / widest);
    return COLS[i % 2].map((v) => new THREE.Vector3(v * w, y, lift * Math.sqrt(1 - v * v)));
  });
  const rim = [
    ...grid.map((row) => row[0]), // tip → left side → foot
    ...grid.slice(1, -1).reverse().map((row) => row[row.length - 1]), // right side back up
  ].map((p) => new THREE.Vector2(p.x, p.y));
  return facetMesh(rim, 0.06, (push) => {
    const facet = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      if (Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) > 1e-9) push(a, b, c);
    };
    for (let r = 0; r + 1 < grid.length; r++) {
      // a strip between two rows, left to right, stepping along whichever row's next column comes first
      const top = grid[r],
        low = grid[r + 1];
      const tv = COLS[r % 2],
        lv = COLS[(r + 1) % 2];
      let i = 0,
        j = 0;
      while (i < top.length - 1 || j < low.length - 1) {
        if (j >= low.length - 1 || (i < top.length - 1 && tv[i + 1] <= lv[j + 1])) {
          facet(top[i], low[j], top[i + 1]);
          i++;
        } else {
          facet(top[i], low[j], low[j + 1]);
          j++;
        }
      }
    }
  });
}

/** The rim moved inwards by a constant `d`, at height z (vertex by vertex, so indices still match). */
function inset(rim: THREE.Vector2[], d: number, z: number): THREE.Vector3[] {
  const n = rim.length;
  return rim.map((p, i) => {
    const prev = rim[(i + n - 1) % n],
      next = rim[(i + 1) % n];
    const e1 = p.clone().sub(prev).normalize(),
      e2 = next.clone().sub(p).normalize();
    // inward normals of a CCW outline point left of each edge
    const nrm = new THREE.Vector2(-e1.y - e2.y, e1.x + e2.x);
    const len = nrm.length() || 1;
    const cos = Math.max(0.5, len / 2); // keep a constant width across the corners
    return new THREE.Vector3(p.x + (nrm.x / len) * (d / cos), p.y + (nrm.y / len) * (d / cos), z);
  });
}

/** Triangles between an outer and an inner ring, both CCW from the top, matched by angle round the centre. */
function zip(push: Push, outer: THREE.Vector3[], inner: THREE.Vector3[]) {
  const TAU = Math.PI * 2;
  const turn = (p: THREE.Vector3, i: number) => (i === 0 ? 0 : (((Math.atan2(p.y, p.x) - Math.PI / 2) % TAU) + TAU) % TAU);
  const ao = [...outer.map(turn), TAU],
    ai = [...inner.map(turn), TAU];
  const n = outer.length,
    m = inner.length;
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (j >= m || (i < n && ao[i + 1] <= ai[j + 1])) {
      push(outer[i], outer[(i + 1) % n], inner[j % m]);
      i++;
    } else {
      push(outer[i % n], inner[(j + 1) % m], inner[j]);
      j++;
    }
  }
}

/**
 * Starflower: a polished bevel all round the outline, a flat pentagon table
 * pointing at the tips, each arm a fan from its table corner, each valley one facet.
 */
function starflowerCut(): THREE.BufferGeometry {
  const { rim, owner } = fivefold(STARFLOWER_HALF_POINT);
  const tableZ = 0.2;
  const corners = Array.from({ length: 5 }, (_, k) => {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 5;
    return new THREE.Vector3(Math.cos(a) * 0.44, Math.sin(a) * 0.44, tableZ);
  });
  return facetMesh(rim, 0.1, (push) => {
    const edge = rim.map((p) => at(p, 0));
    const bevel = inset(rim, 0.055, 0.07);
    ringBand(push, edge, bevel);
    const n = bevel.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      push(bevel[i], bevel[j], corners[owner[j]]);
      if (owner[i] !== owner[j]) push(bevel[i], corners[owner[j]], corners[owner[i]]); // the valley facet
    }
    const mid = new THREE.Vector3(0, 0, tableZ);
    for (let k = 0; k < 5; k++) push(corners[k], corners[(k + 1) % 5], mid);
  });
}

/**
 * Rivoli star: a five-pointed pyramid — ridges run from the centre to each
 * tip, creases to each valley — crowned by the small rosette of twenty facets
 * the photo shows at its heart.
 */
function rivoliStarCut(): THREE.BufferGeometry {
  const { rim } = fivefold(RIVOLI_STAR_HALF_POINT);
  const apexZ = 0.3;
  const rosette = 0.24;
  const valley = Math.hypot(...RIVOLI_STAR_HALF_POINT[RIVOLI_STAR_HALF_POINT.length - 1]);
  // twenty points on tip, valley and half-way rays; each sits on the pyramid, every other one a little lower
  const ring = Array.from({ length: 20 }, (_, k) => {
    const a = Math.PI / 2 + (k * Math.PI) / 10;
    const reach = k % 4 === 0 ? 1 : k % 4 === 2 ? valley : (1 + valley) / 2;
    const z = apexZ * (1 - rosette / reach) - (k % 2 ? 0.045 : 0);
    return new THREE.Vector3(Math.cos(a) * rosette, Math.sin(a) * rosette, z);
  });
  return facetMesh(rim, 0.1, (push) => {
    zip(
      push,
      rim.map((p) => at(p, 0)),
      ring,
    );
    const apex = new THREE.Vector3(0, 0, apexZ);
    for (let k = 0; k < 20; k++) push(ring[k], ring[(k + 1) % 20], apex);
  });
}

/** Heart: a step of crown facets round the outline, then facets running up to a pentagon table, as on the photos. */
function heartCut(): THREE.BufferGeometry {
  const rim = mirrored(HEART_HALF);
  return facetMesh(rim, 0.12, (push) => {
    const edge = rim.map((p) => at(p, 0));
    // scaled rather than inset: an inset would fold over itself at the sharp tip
    const crown = scaledRing(rim, new THREE.Vector2(), 0.82, 0.8, 0.15);
    ringBand(push, edge, crown);
    const table = HEART_TABLE.map(([x, y]) => new THREE.Vector3(x, y, 0.26));
    zip(push, crown, table);
    const top = new THREE.Vector3(0, 0.05, 0.26);
    for (let k = 0; k < table.length; k++) push(table[k], table[(k + 1) % table.length], top);
  });
}

/** Distance from p to the closed loop `loop` (or the open polyline, when `closed` is false). */
function distanceToLoop(p: THREE.Vector2, loop: THREE.Vector2[], closed = true): number {
  let d = Infinity;
  const ab = new THREE.Vector2(),
    q = new THREE.Vector2();
  for (let i = 0; i < (closed ? loop.length : loop.length - 1); i++) {
    const a = loop[i],
      b = loop[(i + 1) % loop.length];
    ab.subVectors(b, a);
    const t = Math.min(1, Math.max(0, q.subVectors(p, a).dot(ab) / (ab.lengthSq() || 1)));
    d = Math.min(d, p.distanceTo(q.copy(a).addScaledVector(ab, t)));
  }
  return d;
}

interface CharmOptions {
  /** Openings through the charm (the open heart's middle, the gap between the cherries' stems). */
  holes?: number[][][];
  /** Lines where two parts meet and the surface dips to `creaseFloor` of its height (the cleft between the two cherries). */
  creases?: number[][][];
  creaseFloor?: number;
}

/**
 * A polished gold charm with the given outline: a flat back, a short straight
 * edge, and a top that rises from every edge (outline and openings alike) in
 * a quarter round of `round` to `height` — a slim part becomes a round rod, a
 * wide one a cushion with a flat top. Smooth-shaded, the way polished metal reads.
 */
function goldCharm(points: number[][], height: number, round: number, girdle: number, options: CharmOptions = {}): THREE.BufferGeometry[] {
  const loop = (pts: number[][], clockwise: boolean) => {
    const l = pts.map(([x, y]) => new THREE.Vector2(x, y));
    return THREE.ShapeUtils.isClockWise(l) === clockwise ? l : l.reverse();
  };
  // the outline turns CCW and every opening CW: the metal is then on the left of every edge
  const outline = loop(points, false);
  const holes = (options.holes ?? []).map((h) => loop(h, true));
  const loops = [outline, ...holes];
  const creases = (options.creases ?? []).map((c) => c.map(([x, y]) => new THREE.Vector2(x, y)));
  const verts = loops.flat().map((p) => p.clone());
  const flat = THREE.ShapeUtils.triangulateShape(outline, holes).map(([a, b, c]) => {
    const [pa, pb, pc] = [verts[a], verts[b], verts[c]];
    return (pb.x - pa.x) * (pc.y - pa.y) - (pc.x - pa.x) * (pb.y - pa.y) < 0 ? [a, c, b] : [a, b, c];
  });
  let faces = flat;
  // split every triangle in four, four times, so the rounded top has vertices inside the outline
  for (let level = 0; level < 4; level++) {
    const mids = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      let i = mids.get(key);
      if (i === undefined) {
        i = verts.length;
        verts.push(verts[a].clone().add(verts[b]).multiplyScalar(0.5));
        mids.set(key, i);
      }
      return i;
    };
    faces = faces.flatMap(([a, b, c]) => {
      const ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      return [
        [a, ab, ca],
        [ab, b, bc],
        [ca, bc, c],
        [ab, bc, ca],
      ];
    });
  }
  const profile = (d: number) => {
    const k = 1 - Math.min(d / round, 1);
    return Math.sqrt(1 - k * k);
  };
  const floor = options.creaseFloor ?? 0.4;
  const lift = (p: THREE.Vector2) => {
    let h = profile(Math.min(...loops.map((l) => distanceToLoop(p, l))));
    for (const c of creases) h = Math.min(h, floor + (1 - floor) * profile(distanceToLoop(p, c, false)));
    return height * h;
  };
  const top = new THREE.BufferGeometry();
  top.setAttribute("position", new THREE.Float32BufferAttribute(verts.flatMap((p) => [p.x, p.y, lift(p)]), 3));
  top.setIndex(faces.flat());
  top.computeVertexNormals();
  // the straight edges and the flat back (the outline is not star-shaped: the back reuses the triangulation)
  const tri: number[] = [];
  const push = (...v: THREE.Vector3[]) => v.forEach((p) => tri.push(p.x, p.y, p.z));
  for (const l of loops)
    for (let i = 0; i < l.length; i++) {
      const a = l[i],
        b = l[(i + 1) % l.length];
      push(at(a, -girdle), at(b, -girdle), at(b, 0));
      push(at(a, -girdle), at(b, 0), at(a, 0));
    }
  for (const [a, b, c] of flat) push(at(verts[a], -girdle), at(verts[c], -girdle), at(verts[b], -girdle));
  const base = new THREE.BufferGeometry();
  base.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  base.computeVertexNormals();
  return [top, base];
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

function starPath(outer: number, inner: number, z = 0): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    out.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z));
  }
  return out;
}
/** The outline of each shape, as the shop's photos show it. Sizes are normalised afterwards. */
function buildParts(shape: StudioShape): THREE.BufferGeometry[] {
  switch (shape) {
    case "round":
      // faceted dome on a flat base, cut just behind the girdle
      return [flattenBack(new THREE.IcosahedronGeometry(0.8, 1).scale(1, 1, 0.62), -0.06)];
    case "baguette":
      // a 1:2 step-cut rectangle with barely clipped corners
      return [crystalCut(new THREE.Shape(v2([[0.42, 1], [-0.42, 1], [-0.5, 0.92], [-0.5, -0.92], [-0.42, -1], [0.42, -1], [0.5, -0.92], [0.5, 0.92]])))];
    case "square":
      return [crystalCut(new THREE.Shape(v2([[0.84, 0.92], [-0.84, 0.92], [-0.92, 0.84], [-0.92, -0.84], [-0.84, -0.92], [0.84, -0.92], [0.92, -0.84], [0.92, 0.84]])))];
    case "heart":
      return [heartCut()];
    case "open-heart":
      // a round rod: the quarter round reaches the middle of the band from both of its edges
      return goldCharm(OPEN_HEART_OUTLINE, 0.13, 0.14, 0.04, { holes: [OPEN_HEART_HOLE] });
    case "kite":
      // Swarovski "Diamond Shape": a flat lozenge, taller than wide
      return [crystalCut(new THREE.Shape(v2([[0, 1], [0.6, 0], [0, -1], [-0.6, 0]])))];
    case "navette":
      return [navetteCut()];
    case "raindrop":
      return [raindropCut()];
    case "triangle":
      return [crystalCut(new THREE.Shape(v2([[0, 0.95], [-0.84, -0.62], [0.84, -0.62]])))];
    case "rivoli-star":
      return [rivoliStarCut()];
    case "starflower":
      return [starflowerCut()];
    case "halo-star":
      return [wire(starPath(1, 0.5), 0.12, true)];
    case "bolt":
      return goldCharm(BOLT_OUTLINE, 0.17, 0.2, 0.05);
    case "cherries":
      // the cleft runs from where the stems leave the fruit down to the notch between the two cherries
      return goldCharm(CHERRIES_OUTLINE, 0.22, 0.3, 0.05, { holes: [CHERRIES_HOLE], creases: [[[0.133, -0.373], [0.153, -0.777]]] });
    case "snake":
      return goldCharm(SNAKE_OUTLINE, 0.13, 0.11, 0.05);
    case "dachshund":
      return goldCharm(DACHSHUND_OUTLINE, 0.15, 0.16, 0.05);
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
