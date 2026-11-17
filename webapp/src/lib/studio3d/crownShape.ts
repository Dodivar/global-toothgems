/**
 * One crown of the Studio's dentition, built as a closed, smooth triangle
 * mesh from a handful of measurements. Pure numbers, no three.js: the engine
 * wraps the arrays in buffers, the tests measure them as they are.
 *
 * The crown's own frame, in millimetres: x along the arch (+ toward distal),
 * y along the tooth from its biting end (0) toward the root, z out of the
 * labial (buccal) face. The crown is a stack of superellipse cross-sections
 * along y. Each side of a section — mesial and distal, labial and lingual —
 * has its own extent, so the outline seen from the front and the outline
 * seen from the side each follow their own profile:
 *
 * - the biting end: a thin rounded edge, straight across with rounded
 *   corners (incisors); a rounded point with a longer distal slope
 *   (canines); an occlusal table with rounded margins, raised into smooth
 *   cusps around a shallow fossa (premolars and molars);
 * - the body: widest at the contact areas, narrowing toward the gum line;
 * - the cervical end: a rounded dome where the gum would be — the model has
 *   no gum.
 *
 * Every section is cut in its four quadrants at equal arc length, so the
 * labial face, where the gems go, is meshed as finely as the corners. The
 * placement of a gem follows the triangle it lands on, so a face meshed in
 * coarse facets would tilt a gem in steps as it is dragged.
 */

export type CrownKind = "incisor" | "canine" | "premolar" | "molar";

/** A cusp of a premolar or molar: a smooth bump on the occlusal table, in the crown's frame (mm). */
export interface Cusp {
  x: number;
  z: number;
  /** How far the cusp tip rises above the table, mm. */
  height: number;
  /** Spread of the bump (standard deviation), mm. */
  radius: number;
}

interface CrownCommon {
  /**
   * Biting end → gum line: the visible crown, mm. For a premolar or molar,
   * from its occlusal table (y = 0); the cusps rise past it.
   */
  crownHeight: number;
  /** The rounded cervical end above the gum line, mm. */
  domeHeight: number;
  /** Roundness of that dome: 2 = elliptic, lower = more pointed. */
  domeRoundness: number;
  /** Half the mesiodistal width at the contact areas, mesial and distal side, mm. */
  halfWidthMesial: number;
  halfWidthDistal: number;
  /** Height of the contact areas (the widest point seen from the front), from the biting end, mm. */
  contactLevel: number;
  /** Width at the gum line, as a share of the width at the contact areas. */
  cervicalWidth: number;
  /** Labial and lingual half-depths at their height of contour, mm. */
  halfDepthLabial: number;
  halfDepthLingual: number;
  /** Depth at the gum line, as a share of the full depth. */
  cervicalDepth: number;
  /** Squareness of the cross-section: 2 = ellipse, higher = flatter faces and tighter corners. */
  squareness: number;
}

export interface IncisorParams extends CrownCommon {
  kind: "incisor";
  /** Radius of the incisal corners seen from the front, mesial and distal, mm. */
  cornerMesial: number;
  cornerDistal: number;
  /** Radius of the incisal edge seen from the side, mm. */
  edgeRadius: number;
  /** How fast the labial and lingual faces open from the edge (half-depth gained per mm). */
  slopeLabial: number;
  slopeLingual: number;
}

export interface CanineParams extends CrownCommon {
  kind: "canine";
  /** How fast the mesial and distal cusp slopes widen from the tip (half-width gained per mm). */
  slopeMesial: number;
  slopeDistal: number;
  /** How fast the labial and lingual faces open from the tip. */
  slopeLabial: number;
  slopeLingual: number;
  /** Roundness of the tip, mm. */
  tipRadius: number;
}

export interface PosteriorParams extends CrownCommon {
  kind: "premolar" | "molar";
  /** Radius of the rounded occlusal margins, mm. */
  marginRadius: number;
  /** Labial and lingual half-depths at the occlusal margin, as shares of the full ones (the faces lean in toward the table). */
  occlusalDepthLabial: number;
  occlusalDepthLingual: number;
  /** Heights of contour of the labial and lingual faces, from the biting end, mm. */
  contourLabial: number;
  contourLingual: number;
  cusps: Cusp[];
  /** How deep the central fossa dips below the table, mm. */
  fossaDepth: number;
}

export type CrownParams = IncisorParams | CanineParams | PosteriorParams;

/** Mesh density: points around every section, and rings along the crown. */
export interface CrownResolution {
  /** Points around a section; a multiple of 4. */
  around: number;
  /** Rings over the biting end, the body and the dome. */
  tip: number;
  body: number;
  dome: number;
  /** Rings across the occlusal table of a premolar or molar. */
  table: number;
}

export const DEFAULT_CROWN_RESOLUTION: CrownResolution = { around: 56, tip: 12, body: 14, dome: 12, table: 8 };

/** A closed triangle mesh, outward-facing (counter-clockwise seen from outside). */
export interface CrownMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** One cross-section: its four half-extents (mm) and its squareness. */
export interface CrownSection {
  mesial: number;
  distal: number;
  labial: number;
  lingual: number;
  squareness: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
/** Smooth minimum of two positive lengths: `a` while it is well below `b`, levelling off at `b`. */
const smin = (a: number, b: number, k = 4) => (a <= 0 ? 0 : Math.pow(Math.pow(a, -k) + Math.pow(b, -k), -1 / k));
/** A quarter superellipse: 0 at u = 0, rising to 1 at u = 1 with a level tangent there. */
const quarter = (u: number, q: number) => (u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(1 - Math.pow(1 - u, q), 1 / q));
/** A ramp with a soft start: 0 up to u = 0, a quadratic onset over `e`, then straight on (slope 1). */
const ramp = (u: number, e = 1) => (u <= 0 ? 0 : u < e ? (u * u) / (2 * e) : u - e / 2);
/** A rounded wedge: a round tip of radius ~`r`, then opening at `slope` (half-extent per mm). */
const wedge = (y: number, slope: number, r: number) => (y <= 0 ? 0 : Math.sqrt(slope * slope * y * y + 2 * r * y));
/** A quarter-round margin of radius `r` up to the extent `e`. */
const margin = (y: number, e: number, r: number) => (y >= r ? e : e - r + Math.sqrt(Math.max(0, r * r - (r - y) * (r - y))));

/** Full height of the crown model, biting end to the top of the dome, mm (cusps excluded). */
export function crownLength(p: CrownParams): number {
  return p.crownHeight + p.domeHeight;
}

/** How far the highest cusp rises past the table (0 for incisors and canines), mm. */
export function cuspReach(p: CrownParams): number {
  return p.kind === "premolar" || p.kind === "molar" ? Math.max(0, ...p.cusps.map((c) => c.height)) : 0;
}

/** The cross-section at height `y` along the crown (before the cusps are raised). */
export function crownSection(p: CrownParams, y: number): CrownSection {
  const length = crownLength(p);
  const dome = y <= p.crownHeight ? 1 : quarter((length - y) / p.domeHeight, p.domeRoundness);
  // The sides converge from the contact areas toward the gum line, and keep converging into the dome.
  const taperAt = (h: number, share: number) => 1 - ((1 - share) * ramp(h)) / ramp(1);
  const widthTaper = taperAt((y - p.contactLevel) / (p.crownHeight - p.contactLevel), p.cervicalWidth);
  let mesial: number, distal: number, labial: number, lingual: number;
  let squareness = p.squareness;
  if (p.kind === "incisor") {
    mesial = margin(y, p.halfWidthMesial, p.cornerMesial);
    distal = margin(y, p.halfWidthDistal, p.cornerDistal);
    labial = smin(wedge(y, p.slopeLabial, p.edgeRadius), p.halfDepthLabial);
    lingual = smin(wedge(y, p.slopeLingual, p.edgeRadius), p.halfDepthLingual);
  } else if (p.kind === "canine") {
    mesial = smin(wedge(y, p.slopeMesial, p.tipRadius), p.halfWidthMesial);
    distal = smin(wedge(y, p.slopeDistal, p.tipRadius), p.halfWidthDistal);
    labial = smin(wedge(y, p.slopeLabial, p.tipRadius), p.halfDepthLabial);
    lingual = smin(wedge(y, p.slopeLingual, p.tipRadius), p.halfDepthLingual);
    // A round point, not a square one.
    squareness = 2 + (p.squareness - 2) * smoothstep(0, 2.5, y);
  } else {
    const r = p.marginRadius;
    mesial = margin(y, p.halfWidthMesial, r);
    distal = margin(y, p.halfWidthDistal, r);
    // The labial and lingual faces lean in toward the table, fullest at their height of contour.
    const lean = (share: number, contour: number) => share + (1 - share) * smoothstep(r, Math.max(contour, r + 0.1), y);
    labial = margin(y, p.halfDepthLabial * p.occlusalDepthLabial, r) * (lean(p.occlusalDepthLabial, p.contourLabial) / p.occlusalDepthLabial);
    lingual = margin(y, p.halfDepthLingual * p.occlusalDepthLingual, r) * (lean(p.occlusalDepthLingual, p.contourLingual) / p.occlusalDepthLingual);
  }
  const contour = p.kind === "premolar" || p.kind === "molar" ? Math.min(p.contourLabial, p.contourLingual) : p.contactLevel;
  const depthTaper = taperAt((y - contour) / Math.max(p.crownHeight - contour, 0.5), p.cervicalDepth);
  // The dome is round, whatever the squareness of the body.
  squareness = 2 + (squareness - 2) * Math.sqrt(dome);
  return {
    mesial: mesial * widthTaper * dome,
    distal: distal * widthTaper * dome,
    labial: labial * depthTaper * dome,
    lingual: lingual * depthTaper * dome,
    squareness,
  };
}

/** How far the cusps and the fossa move a point of the occlusal table along y (negative: toward the biting side). */
export function occlusalRelief(p: CrownParams, x: number, z: number): number {
  if (p.kind !== "premolar" && p.kind !== "molar") return 0;
  let dy = 0;
  for (const c of p.cusps) {
    const d2 = (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z);
    dy -= c.height * Math.exp(-d2 / (2 * c.radius * c.radius));
  }
  if (p.fossaDepth) {
    // A shallow basin between the cusps, longer mesiodistally than across.
    const sx = Math.max(p.halfWidthMesial, p.halfWidthDistal) * 0.55;
    const sz = Math.max(p.halfDepthLabial, p.halfDepthLingual) * 0.3;
    dy += p.fossaDepth * Math.exp(-(x * x) / (2 * sx * sx) - (z * z) / (2 * sz * sz));
  }
  return dy;
}

/**
 * One quadrant of a section's outline, from its point on the z axis to its
 * point on the x axis, as `count + 1` points at equal arc length. The
 * explicit forms z(x) then x(z) keep the samples evenly spread on both the
 * flat face and the tight corner.
 */
function quadrant(ex: number, ez: number, n: number, count: number): [number, number][] {
  const fine: [number, number][] = [];
  const SAMPLES = 48;
  const k = Math.pow(2, -1 / n);
  for (let i = 0; i <= SAMPLES; i++) {
    const x = ex * k * (i / SAMPLES);
    fine.push([x, ez * Math.pow(Math.max(0, 1 - Math.pow(x / (ex || 1), n)), 1 / n)]);
  }
  for (let i = SAMPLES - 1; i >= 0; i--) {
    const z = ez * k * (i / SAMPLES);
    fine.push([ex * Math.pow(Math.max(0, 1 - Math.pow(z / (ez || 1), n)), 1 / n), z]);
  }
  const lengths = [0];
  for (let i = 1; i < fine.length; i++) lengths.push(lengths[i - 1] + Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1]));
  const total = lengths[lengths.length - 1];
  const out: [number, number][] = [];
  let j = 1;
  for (let i = 0; i <= count; i++) {
    const target = (total * i) / count;
    while (j < fine.length - 1 && lengths[j] < target) j++;
    const span = lengths[j] - lengths[j - 1];
    const t = span > 0 ? clamp01((target - lengths[j - 1]) / span) : 0;
    out.push([fine[j - 1][0] + (fine[j][0] - fine[j - 1][0]) * t, fine[j - 1][1] + (fine[j][1] - fine[j - 1][1]) * t]);
  }
  out[0] = fine[0];
  out[count] = fine[fine.length - 1];
  return out;
}

/** The outline of a section as `around` (x, z) points, starting on +x (distal) and turning through +z (labial). */
export function sectionOutline(s: CrownSection, around: number): [number, number][] {
  const q = around / 4;
  const n = s.squareness;
  const out: [number, number][] = [];
  // distal → labial
  for (const [x, z] of quadrant(s.distal, s.labial, n, q).reverse().slice(0, q)) out.push([x, z]);
  // labial → mesial
  for (const [x, z] of quadrant(s.mesial, s.labial, n, q).slice(0, q)) out.push([-x, z]);
  // mesial → lingual
  for (const [x, z] of quadrant(s.mesial, s.lingual, n, q).reverse().slice(0, q)) out.push([-x, -z]);
  // lingual → distal
  for (const [x, z] of quadrant(s.distal, s.lingual, n, q).slice(0, q)) out.push([x, -z]);
  return out;
}

/** Heights of the rings along the crown: dense at the biting end, even over the body, even in angle over the dome. */
function ringHeights(p: CrownParams, res: CrownResolution): number[] {
  const tipZone = p.kind === "premolar" || p.kind === "molar" ? p.marginRadius : Math.min(2.6, p.crownHeight * 0.3);
  const ys: number[] = [];
  for (let i = 0; i <= res.tip; i++) {
    const t = i / res.tip;
    // a quarter turn round a posterior margin; quadratic toward the incisal edge or the cusp tip
    ys.push(p.kind === "premolar" || p.kind === "molar" ? tipZone * (1 - Math.cos((t * Math.PI) / 2)) : tipZone * t * t);
  }
  for (let i = 1; i <= res.body; i++) ys.push(tipZone + ((p.crownHeight - tipZone) * i) / res.body);
  for (let i = 1; i <= res.dome; i++) ys.push(p.crownHeight + p.domeHeight * Math.sin(((i / res.dome) * Math.PI) / 2));
  return ys;
}

/** A frame the crown is set in: where its biting end's centre lands, and its three axes (unit vectors). */
export interface CrownPlacement {
  origin: [number, number, number];
  /** The crown's +x (distal), +y (toward the root) and +z (labial) in the target space. */
  xAxis: [number, number, number];
  yAxis: [number, number, number];
  zAxis: [number, number, number];
}

const IDENTITY: CrownPlacement = { origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1] };

/**
 * The crown as a closed mesh, set in `placement` (its own frame by default).
 * Coincident points — the incisal edge, the tip, the poles — are welded, so
 * the normals there are smooth and the mesh is watertight.
 */
export function buildCrown(p: CrownParams, placement: CrownPlacement = IDENTITY, res: CrownResolution = DEFAULT_CROWN_RESOLUTION): CrownMesh {
  const around = res.around;
  const ys = ringHeights(p, res);
  const posterior = p.kind === "premolar" || p.kind === "molar";
  const fade = posterior ? p.marginRadius + 2.6 : 0;
  // The rings, as (x, y, z) in the crown's frame, occlusal table first.
  const rings: [number, number, number][][] = [];
  const first = sectionOutline(crownSection(p, 0), around);
  if (posterior) {
    for (let k = 0; k < res.table; k++) {
      const f = k / res.table;
      rings.push(first.map(([x, z]) => [x * f, 0, z * f]));
    }
  }
  for (const y of ys) rings.push(sectionOutline(crownSection(p, y), around).map(([x, z]) => [x, y, z]));
  if (posterior) {
    for (const ring of rings) {
      for (const v of ring) {
        const w = 1 - smoothstep(p.marginRadius, fade, v[1]);
        if (w > 0) v[1] += occlusalRelief(p, v[0], v[2]) * w;
      }
    }
  }

  // Weld coincident points (quantised to a micrometre) and set the rest in place.
  const { origin, xAxis, yAxis, zAxis } = placement;
  const index = new Map<string, number>();
  const pos: number[] = [];
  const ids = rings.map((ring) =>
    ring.map(([x, y, z]) => {
      const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
      let id = index.get(key);
      if (id === undefined) {
        id = pos.length / 3;
        index.set(key, id);
        pos.push(
          origin[0] + xAxis[0] * x + yAxis[0] * y + zAxis[0] * z,
          origin[1] + xAxis[1] * x + yAxis[1] * y + zAxis[1] * z,
          origin[2] + xAxis[2] * x + yAxis[2] * y + zAxis[2] * z,
        );
      }
      return id;
    }),
  );

  // A mirroring placement turns the faces inside out: wind them the other way.
  const det =
    xAxis[0] * (yAxis[1] * zAxis[2] - yAxis[2] * zAxis[1]) -
    xAxis[1] * (yAxis[0] * zAxis[2] - yAxis[2] * zAxis[0]) +
    xAxis[2] * (yAxis[0] * zAxis[1] - yAxis[1] * zAxis[0]);
  const flip = det < 0;
  const tri: number[] = [];
  const push = (a: number, b: number, c: number) => {
    if (a === b || b === c || c === a) return; // collapsed at a weld
    if (flip) tri.push(a, c, b);
    else tri.push(a, b, c);
  };
  for (let i = 0; i + 1 < ids.length; i++) {
    const r0 = ids[i],
      r1 = ids[i + 1];
    for (let j = 0; j < around; j++) {
      const j1 = (j + 1) % around;
      push(r0[j], r1[j], r0[j1]);
      push(r0[j1], r1[j], r1[j1]);
    }
  }

  const positions = new Float32Array(pos);
  const indices = new Uint32Array(tri);
  return { positions, normals: vertexNormals(positions, indices), indices };
}

/** Area-weighted vertex normals of an indexed mesh. */
export function vertexNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3,
      b = indices[t + 1] * 3,
      c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a],
      uy = positions[b + 1] - positions[a + 1],
      uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a],
      vy = positions[c + 1] - positions[a + 1],
      vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) {
      normals[i] += nx;
      normals[i + 1] += ny;
      normals[i + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l;
    normals[i + 1] /= l;
    normals[i + 2] /= l;
  }
  return normals;
}
