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
 *   (canines); an occlusal table with rounded margins, carved into shallow
 *   grooves and a fossa between its cusps (premolars and molars) — the cusp
 *   tips stand level with the margin, so the crown's outline stays smooth;
 * - the body: widest at the contact areas, narrowing toward the gum line;
 * - the cervical end: a rounded dome where the gum would be — the model has
 *   no gum.
 *
 * Every profile joins the next with a continuous curvature (no quarter
 * circle meeting a straight wall): on a glossy finish a curvature step shows
 * as a band in the reflections. Every section is cut in its four quadrants
 * at even spacing, tightened where the outline turns, so the labial face,
 * where the gems go, is finely meshed and the corners show no facets. The
 * placement of a gem follows the triangle it lands on, so a face meshed in
 * coarse facets would tilt a gem in steps as it is dragged.
 */

export type CrownKind = "incisor" | "canine" | "premolar" | "molar";

/** A cusp of a premolar or molar, in the crown's frame (mm): a lobe of the occlusal table, the grooves around it carved below its tip. */
export interface Cusp {
  x: number;
  z: number;
  /** How far the cusp tip stands above the grooves around it, mm. */
  height: number;
  /** Spread of the lobe (standard deviation), mm. */
  radius: number;
}

interface CrownCommon {
  /** Biting end → gum line: the visible crown, mm. */
  crownHeight: number;
  /** The rounded cervical end above the gum line, mm. */
  domeHeight: number;
  /** Roundness of the dome's top: 2 = round, lower = more pointed. */
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
  /** How deep the central fossa sinks below the grooves, mm. */
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

export const DEFAULT_CROWN_RESOLUTION: CrownResolution = { around: 60, tip: 12, body: 13, dome: 12, table: 9 };

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
/** Smootherstep: 0 to 1 between `e0` and `e1`, with level tangents and no curvature at both ends. */
const smootherstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * t * (t * (6 * t - 15) + 10);
};
/** Smooth minimum of two positive lengths: `a` while it is well below `b`, levelling off at `b`. */
const smin = (a: number, b: number, k = 4) => (a <= 0 ? 0 : Math.pow(Math.pow(a, -k) + Math.pow(b, -k), -1 / k));
/** A ramp: 0 up to u = 0, then growing as u³ / (u + ½) — about u² further on; level and without curvature at its start. */
const ramp = (u: number) => (u <= 0 ? 0 : (u * u * u) / (u + 0.5));
/** A rounded wedge: a round tip of radius ~`r`, then opening at `slope` (half-extent per mm). */
const wedge = (y: number, slope: number, r: number) => (y <= 0 ? 0 : Math.sqrt(slope * slope * y * y + 2 * r * y));
/**
 * A rounded margin of radius ~`r` up to the extent `e`: a superellipse
 * quarter, whose curvature fades to nothing where it meets the face and the
 * edge (a quarter circle would meet them with a step in curvature).
 */
const FILLET = 2.6;
const margin = (y: number, e: number, r: number) => {
  if (y >= r) return e;
  const t = (r - Math.max(0, y)) / r;
  return e - r + r * Math.pow(Math.max(0, 1 - Math.pow(t, FILLET)), 1 / FILLET);
};
/**
 * The dome's profile at `t` (0 at the gum line, 1 at the top): flat where it
 * leaves the body (no curvature step there), closing round at the top.
 */
const DOME_SHOULDER = 2.6;
const domeProfile = (t: number, roundness: number) => (t <= 0 ? 1 : t >= 1 ? 0 : Math.pow(1 - Math.pow(t, DOME_SHOULDER), 1 / roundness));

/** Full height of the crown model, biting end to the top of the dome, mm. */
export function crownLength(p: CrownParams): number {
  return p.crownHeight + p.domeHeight;
}

/** The cross-section at height `y` along the crown (before the occlusal table is carved). */
export function crownSection(p: CrownParams, y: number): CrownSection {
  const dome = y <= p.crownHeight ? 1 : domeProfile((y - p.crownHeight) / p.domeHeight, p.domeRoundness);
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
    squareness = 2 + (p.squareness - 2) * smootherstep(0, 3, y);
  } else {
    const r = p.marginRadius;
    mesial = margin(y, p.halfWidthMesial, r);
    distal = margin(y, p.halfWidthDistal, r);
    // The labial and lingual faces lean in toward the table, fullest at their height of contour.
    const lean = (share: number, contour: number) => share + (1 - share) * smootherstep(0, Math.max(contour, r + 0.1), y);
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

/** The cusp lobes at a point of the table: how far it stands above the grooves (mm, before levelling). */
function lobes(p: PosteriorParams, x: number, z: number): number {
  let h = 0;
  for (const c of p.cusps) {
    const d2 = (x - c.x) * (x - c.x) + (z - c.z) * (z - c.z);
    h += c.height * Math.exp(-d2 / (2 * c.radius * c.radius));
  }
  return h;
}

/**
 * How deep a point of the occlusal table is carved below the margin, mm
 * (along +y, into the crown): the grooves between the cusps and the central
 * fossa. The highest cusp tip stays level with the margin, so nothing stands
 * past the crown's outline; 0 for incisors and canines.
 */
export function occlusalRelief(p: CrownParams, x: number, z: number): number {
  if (p.kind !== "premolar" && p.kind !== "molar") return 0;
  const top = highestLobe(p);
  let depth = Math.max(0, top - lobes(p, x, z));
  if (p.fossaDepth) {
    // A shallow basin between the cusps, longer mesiodistally than across.
    const sx = Math.max(p.halfWidthMesial, p.halfWidthDistal) * 0.5;
    const sz = Math.max(p.halfDepthLabial, p.halfDepthLingual) * 0.28;
    depth += p.fossaDepth * Math.exp(-(x * x) / (2 * sx * sx) - (z * z) / (2 * sz * sz));
  }
  return depth;
}

const lobeTops = new WeakMap<PosteriorParams, number>();
/** The highest the lobes stand anywhere on the table (sampled once per crown). */
function highestLobe(p: PosteriorParams): number {
  let top = lobeTops.get(p);
  if (top !== undefined) return top;
  top = 0;
  const s = crownSection(p, 0);
  for (let i = -20; i <= 20; i++)
    for (let k = -20; k <= 20; k++) {
      const x = (i / 20) * (i < 0 ? s.mesial : s.distal);
      const z = (k / 20) * (k < 0 ? s.lingual : s.labial);
      top = Math.max(top, lobes(p, x, z));
    }
  lobeTops.set(p, top);
  return top;
}

/**
 * One quadrant of a section's outline, from its point on the z axis to its
 * point on the x axis, as `count + 1` points. They are spread by arc length
 * plus the angle the outline turns through, so a flat face is evenly meshed
 * and a corner gets the closer points its curvature needs. The explicit
 * forms z(x) then x(z) sample both the face and the corner finely first.
 */
function quadrant(ex: number, ez: number, n: number, count: number): [number, number][] {
  const fine: [number, number][] = [];
  const SAMPLES = 64;
  const k = Math.pow(2, -1 / n);
  for (let i = 0; i <= SAMPLES; i++) {
    const x = ex * k * (i / SAMPLES);
    fine.push([x, ez * Math.pow(Math.max(0, 1 - Math.pow(x / (ex || 1), n)), 1 / n)]);
  }
  for (let i = SAMPLES - 1; i >= 0; i--) {
    const z = ez * k * (i / SAMPLES);
    fine.push([ex * Math.pow(Math.max(0, 1 - Math.pow(z / (ez || 1), n)), 1 / n), z]);
  }
  // How much a turn of the outline counts against its length: a corner of this section takes about two fifths of the points.
  const turnWeight = 0.28 * (ex + ez);
  const measure = [0];
  let heading = Math.atan2(fine[1][1] - fine[0][1], fine[1][0] - fine[0][0]);
  for (let i = 1; i < fine.length; i++) {
    const dx = fine[i][0] - fine[i - 1][0],
      dz = fine[i][1] - fine[i - 1][1];
    const len = Math.hypot(dx, dz);
    let turn = 0;
    if (len > 1e-9) {
      const h = Math.atan2(dz, dx);
      turn = Math.abs(Math.atan2(Math.sin(h - heading), Math.cos(h - heading)));
      heading = h;
    }
    measure.push(measure[i - 1] + len + turnWeight * turn);
  }
  const total = measure[measure.length - 1];
  const out: [number, number][] = [];
  let j = 1;
  for (let i = 0; i <= count; i++) {
    const target = (total * i) / count;
    while (j < fine.length - 1 && measure[j] < target) j++;
    const span = measure[j] - measure[j - 1];
    const t = span > 0 ? clamp01((target - measure[j - 1]) / span) : 0;
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
  const posterior = p.kind === "premolar" || p.kind === "molar";
  const tipZone = posterior ? p.marginRadius : Math.min(2.6, p.crownHeight * 0.3);
  const ys: number[] = [];
  for (let i = 0; i <= res.tip; i++) {
    const t = i / res.tip;
    // round a posterior margin evenly; quadratic toward the incisal edge or the cusp tip
    ys.push(posterior ? tipZone * (1 - Math.cos((t * Math.PI) / 2)) : tipZone * t * t);
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
  // The rings, as (x, y, z) in the crown's frame, occlusal table first.
  const rings: [number, number, number][][] = [];
  const first = sectionOutline(crownSection(p, 0), around);
  if (posterior) {
    for (let k = 0; k < res.table; k++) {
      const f = k / res.table;
      // carved toward the middle, level with the margin at the rim (a smooth marginal ridge)
      const w = 1 - smootherstep(0.68, 1, f);
      rings.push(first.map(([x, z]) => [x * f, occlusalRelief(p, x * f, z * f) * w, z * f]));
    }
  }
  for (const y of ys) rings.push(sectionOutline(crownSection(p, y), around).map(([x, z]) => [x, y, z]));

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
