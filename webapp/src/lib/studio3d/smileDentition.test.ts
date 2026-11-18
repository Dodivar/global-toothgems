import { describe, expect, it } from "vitest";
import { ALL_TEETH, LOWER_TEETH, UPPER_TEETH, toothKeys, type Vec3 } from "../../data/studioEditor";
import type { CrownMesh } from "./crownShape";
import { DENTITION_CROWNS, type CrownFrame } from "./dentition";
import { buildSmileMeshes, SMILE_CROWNS, SMILE_TEETH } from "./smileDentition";

const MESHES = new Map(buildSmileMeshes().map((t) => [t.fdi, t.mesh]));
const frame = (fdi: string) => SMILE_CROWNS.find((c) => c.fdi === fdi)!;
const mirror = (fdi: string) => `${{ "1": 2, "2": 1, "3": 4, "4": 3 }[fdi[0]]}${fdi[1]}`;

type V = [number, number, number];
const vec = (v: Vec3): V => [v.x, v.y, v.z];
const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit = (a: V): V => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The nearest hit of a ray on a mesh (Möller–Trumbore), with the hit triangle's normal. */
function raycast(mesh: CrownMesh, origin: V, dir: V): { point: V; normal: V; distance: number } | null {
  const p = mesh.positions;
  const at = (i: number): V => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  let best: { point: V; normal: V; distance: number } | null = null;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = at(mesh.indices[t]),
      b = at(mesh.indices[t + 1]),
      c = at(mesh.indices[t + 2]);
    const e1 = sub(b, a),
      e2 = sub(c, a);
    const h = cross(dir, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(origin, a);
    const u = dot(s, h) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1);
    const v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) continue;
    const d = dot(e2, q) / det;
    if (d <= 0 || (best && d >= best.distance)) continue;
    best = { point: add(origin, dir, d), normal: unit(cross(e1, e2)), distance: d };
  }
  return best;
}

/** A point on a crown's labial face, `u` across and `v` up as the engine's seats measure them (`captureSeats`). */
function seatRay(c: CrownFrame, u: number, v: number) {
  const wHalf = (c.alongMinus + c.alongPlus) / 2,
    hHalf = (c.top - c.bottom) / 2;
  const target = add(add(vec(c.center), vec(c.tangent), u * wHalf * 0.6), [0, 1, 0], v * hHalf * 0.55);
  return { origin: add(target, vec(c.outward), 20), dir: unit(vec(c.outward).map((x) => -x) as V) };
}

function extentAlong(mesh: CrownMesh, origin: V, dir: V) {
  let min = Infinity,
    max = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const d = dot(sub([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]], origin), dir);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return { min, max };
}

function yRange(mesh: CrownMesh) {
  let min = Infinity,
    max = -Infinity;
  for (let i = 1; i < mesh.positions.length; i += 3) {
    min = Math.min(min, mesh.positions[i]);
    max = Math.max(max, mesh.positions[i]);
  }
  return { min, max };
}

describe("the Studio's dentition", () => {
  it("has every tooth of both arches, once, each its own mesh", () => {
    expect(SMILE_TEETH.map((t) => t.fdi)).toEqual([...UPPER_TEETH, ...LOWER_TEETH]);
    expect([...MESHES.keys()].sort()).toEqual([...ALL_TEETH].sort());
    for (const t of SMILE_TEETH) expect(t.lower).toBe(t.fdi[0] === "3" || t.fdi[0] === "4");
  });

  it("stays light enough to draw on a phone", () => {
    let triangles = 0;
    for (const mesh of MESHES.values()) triangles += mesh.indices.length / 3;
    expect(triangles).toBeLessThan(150_000);
  });

  it("is symmetric about the midline", () => {
    for (const c of SMILE_CROWNS) {
      const m = frame(mirror(c.fdi));
      expect(c.center.x).toBeCloseTo(-m.center.x, 6);
      expect(c.center.y).toBeCloseTo(m.center.y, 6);
      expect(c.center.z).toBeCloseTo(m.center.z, 6);
      expect(c.alongMinus).toBeCloseTo(m.alongPlus, 6);
    }
  });

  it("is at real size: average adult crowns", () => {
    const width = (fdi: string) => frame(fdi).alongMinus + frame(fdi).alongPlus;
    expect(width("11")).toBeCloseTo(8.6, 1);
    expect(width("13")).toBeCloseTo(7.6, 1);
    expect(width("16")).toBeCloseTo(10.2, 1);
    expect(width("41")).toBeCloseTo(5.8, 1);
    expect(width("46")).toBeCloseTo(11, 1);
    const height = (fdi: string) => frame(fdi).top - frame(fdi).bottom;
    expect(height("11")).toBeGreaterThan(9);
    expect(height("11")).toBeLessThan(11);
    expect(height("46")).toBeGreaterThan(6.5);
    expect(height("46")).toBeLessThan(8);
  });

  it("lays a real arch: canines ~34 mm apart, first molars ~55–60 mm, about 25 mm behind the incisors", () => {
    expect(frame("23").center.x - frame("13").center.x).toBeGreaterThan(32);
    expect(frame("23").center.x - frame("13").center.x).toBeLessThan(38);
    expect(frame("26").center.x - frame("16").center.x).toBeGreaterThan(52);
    expect(frame("26").center.x - frame("16").center.x).toBeLessThan(62);
    expect(frame("11").center.z - frame("16").center.z).toBeGreaterThan(20);
    expect(frame("11").center.z - frame("16").center.z).toBeLessThan(30);
    // the lower arch sits inside the upper one
    expect(frame("36").center.x).toBeLessThan(frame("26").center.x);
  });

  it("faces every crown out of the arch, and runs its tangent toward the patient's left", () => {
    for (const c of SMILE_CROWNS) {
      expect(Math.hypot(c.outward.x, c.outward.z)).toBeCloseTo(1, 6);
      expect(c.outward.y).toBe(0);
      expect(dot(vec(c.outward), vec(c.tangent))).toBeCloseTo(0, 6);
      // away from the arch's middle, behind the incisors
      expect(dot(vec(c.outward), sub(vec(c.center), [0, c.center.y, -18]))).toBeGreaterThan(0);
    }
    for (const fdi of ["11", "21", "41", "31"]) {
      expect(frame(fdi).outward.z).toBeGreaterThan(0.95);
      expect(frame(fdi).tangent.x).toBeGreaterThan(0.95);
    }
  });

  it("keeps the arches just apart, as in a smile: closer at the back than at the front, never meeting", () => {
    const gap = (upper: string, lower: string) => yRange(MESHES.get(upper)!).min - yRange(MESHES.get(lower)!).max;
    expect(gap("11", "41")).toBeGreaterThan(1);
    expect(gap("11", "41")).toBeLessThan(2.5);
    expect(gap("16", "46")).toBeGreaterThan(0.1);
    expect(gap("16", "46")).toBeLessThan(gap("11", "41"));
    for (const c of SMILE_CROWNS) {
      if (c.lower) expect(c.top).toBeLessThan(0);
      else expect(c.bottom).toBeGreaterThan(0);
    }
  });

  it("sets neighbours in contact, as real teeth touch, without sinking into each other", () => {
    for (const arch of [UPPER_TEETH, LOWER_TEETH]) {
      for (let i = 0; i + 1 < arch.length; i++) {
        const a = frame(arch[i]),
          b = frame(arch[i + 1]);
        const axis = unit(sub(vec(b.center), vec(a.center)));
        const reachA = extentAlong(MESHES.get(a.fdi)!, vec(a.center), axis).max;
        const reachB = -extentAlong(MESHES.get(b.fdi)!, vec(b.center), axis).min;
        const between = Math.hypot(...sub(vec(b.center), vec(a.center)));
        const gap = between - reachA - reachB;
        expect(gap, `${a.fdi}–${b.fdi}`).toBeGreaterThan(-0.6);
        expect(gap, `${a.fdi}–${b.fdi}`).toBeLessThan(0.05);
      }
    }
  });
});

describe("a real smile", () => {
  /** The gap along x between two crowns over a thin horizontal slice at height `y` (negative: they overlap). */
  function sliceGap(left: string, right: string, y: number) {
    const reach = (fdi: string, pick: (a: number, b: number) => number, start: number) => {
      const p = MESHES.get(fdi)!.positions;
      let v = start;
      for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i + 1] - y) < 0.25) v = pick(v, p[i]);
      return v;
    };
    return reach(right, Math.min, Infinity) - reach(left, Math.max, -Infinity);
  }

  it("stands the central incisors upright and side by side: in contact, no gap opening up to the gum line", () => {
    const c = frame("11");
    expect(sliceGap("11", "21", c.bottom + 2.6)).toBeLessThan(0.05);
    expect(sliceGap("11", "21", c.top)).toBeLessThan(1);
    expect(frame("21").center.x).toBeCloseTo(-frame("11").center.x, 6);
  });

  it("draws the upper smile line: the laterals a little shorter than the centrals, the canines level with them", () => {
    const edge = (fdi: string) => yRange(MESHES.get(fdi)!).min;
    expect(edge("12") - edge("11")).toBeGreaterThan(0.3);
    expect(edge("12") - edge("11")).toBeLessThan(1);
    expect(Math.abs(edge("13") - edge("11"))).toBeLessThan(0.3);
  });
});

describe("seats on the Studio's dentition", () => {
  it("finds every seat of the visible crown on its own tooth, below the dome", () => {
    for (const c of SMILE_CROWNS) {
      const mesh = MESHES.get(c.fdi)!;
      for (const u of [-1, -0.5, 0, 0.5, 1])
        for (const v of [-1, -0.5, 0, 0.5, 1]) {
          const { origin, dir } = seatRay(c, u, v);
          const hit = raycast(mesh, origin, dir);
          expect(hit, `${c.fdi} at ${u}, ${v}`).not.toBeNull();
          expect(hit!.point[1]).toBeGreaterThan(c.bottom - 0.4);
          expect(hit!.point[1]).toBeLessThan(c.top + 0.4);
          // the gem faces out of the labial side
          expect(dot(hit!.normal, vec(c.outward))).toBeGreaterThan(0.3);
        }
    }
  });

  it("puts a piece from the former scan back at the same place of the same tooth", () => {
    // A seat is the share of the crown across and up: measured on the scan's frame, applied on the new one.
    for (const scan of DENTITION_CROWNS) {
      const c = frame(scan.fdi);
      const { origin, dir } = seatRay(c, 0.6, -0.4);
      const hit = raycast(MESHES.get(c.fdi)!, origin, dir)!;
      const rel = sub(hit.point, vec(c.center));
      const wHalf = (c.alongMinus + c.alongPlus) / 2,
        hHalf = (c.top - c.bottom) / 2;
      expect(dot(rel, vec(c.tangent)) / (wHalf * 0.6)).toBeCloseTo(0.6, 3);
      expect(rel[1] / (hHalf * 0.55)).toBeCloseTo(-0.4, 3);
    }
  });

  it("gives the side teeth broad, gently curved faces a gem lies flat on", () => {
    // The request: the drawing's side teeth were round pills (over this patch a pill's face turns
    // by some 40°). Over the middle of each canine, premolar and molar face (±40 % of its width,
    // its middle third) the surface turns little; a canine keeps the ridge of its labial lobe.
    for (const c of SMILE_CROWNS) {
      const key = toothKeys(c.fdi)!.tooth;
      if (key === "central" || key === "lateral") continue;
      const mesh = MESHES.get(c.fdi)!;
      const normals: V[] = [];
      for (const u of [-0.66, -0.33, 0, 0.33, 0.66])
        for (const v of [-0.6, 0, 0.6]) {
          const { origin, dir } = seatRay(c, u, v);
          normals.push(raycast(mesh, origin, dir)!.normal);
        }
      const mean = unit(normals.reduce((s, n) => add(s, n), [0, 0, 0] as V));
      const widest = Math.max(...normals.map((n) => (Math.acos(Math.min(1, dot(n, mean))) * 180) / Math.PI));
      expect(widest, c.fdi).toBeLessThan(key === "canine" ? 24 : 19);
    }
  });

  it("leaves room for a 4 mm gem in the middle of a premolar, on the premolar itself", () => {
    for (const fdi of ["14", "24", "34", "44"]) {
      const c = frame(fdi);
      const mesh = MESHES.get(fdi)!;
      const wHalf = (c.alongMinus + c.alongPlus) / 2,
        hHalf = (c.top - c.bottom) / 2;
      // the gem's rim, 2 mm either side of its centre, across and up
      for (const [du, dv] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const { origin, dir } = seatRay(c, du / (wHalf * 0.6), dv / (hHalf * 0.55));
        const hit = raycast(mesh, origin, dir);
        expect(hit, `${fdi} ${du},${dv}`).not.toBeNull();
        expect(hit!.point[1]).toBeGreaterThan(c.bottom - 0.4);
        expect(hit!.point[1]).toBeLessThan(c.top + 0.4);
      }
    }
  });
});
