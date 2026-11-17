import { describe, expect, it } from "vitest";
import {
  buildCrown,
  crownSection,
  cuspReach,
  sectionOutline,
  type CanineParams,
  type CrownMesh,
  type IncisorParams,
  type PosteriorParams,
} from "./crownShape";

const common = {
  domeRoundness: 2,
  cervicalDepth: 0.9,
};
const INCISOR: IncisorParams = {
  kind: "incisor", ...common,
  crownHeight: 9.6, domeHeight: 3.4,
  halfWidthMesial: 4.3, halfWidthDistal: 4.3, contactLevel: 2.4, cervicalWidth: 0.8,
  halfDepthLabial: 3.0, halfDepthLingual: 3.5, squareness: 2.6,
  cornerMesial: 1.1, cornerDistal: 1.9, edgeRadius: 0.35, slopeLabial: 0.42, slopeLingual: 0.62,
};
const CANINE: CanineParams = {
  kind: "canine", ...common,
  crownHeight: 9.6, domeHeight: 3.0,
  halfWidthMesial: 3.8, halfWidthDistal: 3.8, contactLevel: 3.6, cervicalWidth: 0.78,
  halfDepthLabial: 3.7, halfDepthLingual: 4.0, squareness: 2.4,
  slopeMesial: 1.5, slopeDistal: 1.1, slopeLabial: 1.0, slopeLingual: 1.15, tipRadius: 0.55,
};
const MOLAR: PosteriorParams = {
  kind: "molar", ...common,
  crownHeight: 6.45, domeHeight: 2.4,
  halfWidthMesial: 5.1, halfWidthDistal: 5.1, contactLevel: 2.1, cervicalWidth: 0.82,
  halfDepthLabial: 5.4, halfDepthLingual: 5.6, squareness: 2.9,
  marginRadius: 1.7, occlusalDepthLabial: 0.8, occlusalDepthLingual: 0.78, contourLabial: 4.4, contourLingual: 3.0,
  cusps: [
    { x: -2.4, z: 2.9, height: 0.95, radius: 1.65 },
    { x: 2.4, z: 2.9, height: 0.8, radius: 1.6 },
    { x: -2.0, z: -2.9, height: 1.05, radius: 1.9 },
    { x: 2.7, z: -2.8, height: 0.6, radius: 1.5 },
  ],
  fossaDepth: 0.5,
};

/** Every edge of a closed surface is shared by exactly two triangles, once each way. */
function isClosed(mesh: CrownMesh): boolean {
  const edges = new Map<string, number>();
  const { indices } = mesh;
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t + k],
        b = indices[t + ((k + 1) % 3)];
      const key = `${a},${b}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    const [a, b] = key.split(",");
    if (count !== 1 || edges.get(`${b},${a}`) !== 1) return false;
  }
  return true;
}

/** Signed volume (divergence theorem): positive when every face points outward. */
function volume(mesh: CrownMesh): number {
  const p = mesh.positions;
  let v = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t] * 3, mesh.indices[t + 1] * 3, mesh.indices[t + 2] * 3];
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

function bounds(mesh: CrownMesh) {
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], mesh.positions[i + k]);
      max[k] = Math.max(max[k], mesh.positions[i + k]);
    }
  return { min, max };
}

describe("crown mesh", () => {
  for (const p of [INCISOR, CANINE, MOLAR]) {
    it(`builds a closed, outward-facing ${p.kind}`, () => {
      const mesh = buildCrown(p);
      expect(isClosed(mesh)).toBe(true);
      expect(volume(mesh)).toBeGreaterThan(0);
      for (let i = 0; i < mesh.normals.length; i += 3) {
        expect(Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2])).toBeCloseTo(1, 4);
      }
    });
  }

  it("keeps its faces outward when set in a mirroring frame (the other side of the arch, the lower arch)", () => {
    const mirrored = buildCrown(INCISOR, { origin: [0, 0, 0], xAxis: [-1, 0, 0], yAxis: [0, 1, 0], zAxis: [0, 0, 1] });
    expect(volume(mirrored)).toBeGreaterThan(0);
    const lower = buildCrown(MOLAR, { origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, -1, 0], zAxis: [0, 0, 1] });
    expect(volume(lower)).toBeGreaterThan(0);
  });

  it("is as wide, deep and tall as its measurements", () => {
    const { min, max } = bounds(buildCrown(INCISOR));
    expect(max[0] - min[0]).toBeCloseTo(INCISOR.halfWidthMesial + INCISOR.halfWidthDistal, 0);
    expect(max[1] - min[1]).toBeCloseTo(INCISOR.crownHeight + INCISOR.domeHeight, 1);
    expect(max[2] - min[2]).toBeGreaterThan(5.5);
    expect(max[2] - min[2]).toBeLessThan(INCISOR.halfDepthLabial + INCISOR.halfDepthLingual + 0.01);
  });

  it("raises a molar's cusps past its occlusal table", () => {
    const { min } = bounds(buildCrown(MOLAR));
    expect(cuspReach(MOLAR)).toBe(1.05);
    expect(min[1]).toBeLessThan(-0.8);
    expect(min[1]).toBeGreaterThan(-cuspReach(MOLAR) - 0.01);
  });
});

describe("crown profiles", () => {
  it("ends an incisor in a thin edge, straight across", () => {
    const s = crownSection(INCISOR, 0.3);
    expect(s.mesial + s.distal).toBeGreaterThan(0.75 * (INCISOR.halfWidthMesial + INCISOR.halfWidthDistal));
    expect(s.labial + s.lingual).toBeLessThan(1.2);
  });

  it("ends a canine in a point", () => {
    const s = crownSection(CANINE, 0.05);
    expect(s.mesial + s.distal).toBeLessThan(1);
    expect(s.labial + s.lingual).toBeLessThan(1);
  });

  it("narrows toward the gum line, then closes in a dome", () => {
    const contact = crownSection(INCISOR, INCISOR.contactLevel);
    const gum = crownSection(INCISOR, INCISOR.crownHeight);
    const top = crownSection(INCISOR, INCISOR.crownHeight + INCISOR.domeHeight);
    expect(gum.mesial).toBeLessThan(contact.mesial);
    expect(gum.mesial / contact.mesial).toBeGreaterThan(0.7);
    expect(top.mesial).toBeCloseTo(0, 6);
    expect(top.labial).toBeCloseTo(0, 6);
  });
});

describe("section outline", () => {
  it("spaces its points evenly across the labial face, where the gems go", () => {
    const outline = sectionOutline(crownSection(INCISOR, 6), 56);
    // the labial quadrants: from the distal point (index 0) through the labial one (14) to the mesial one (28)
    const steps: number[] = [];
    for (let i = 0; i < 28; i++) steps.push(Math.hypot(outline[i + 1][0] - outline[i][0], outline[i + 1][1] - outline[i][1]));
    const distal = steps.slice(0, 14),
      mesial = steps.slice(14);
    for (const quadrant of [distal, mesial]) {
      const mean = quadrant.reduce((a, b) => a + b, 0) / quadrant.length;
      for (const s of quadrant) expect(Math.abs(s - mean) / mean).toBeLessThan(0.05);
    }
  });

  it("turns from distal through labial to mesial and lingual", () => {
    const outline = sectionOutline(crownSection(MOLAR, 3), 56);
    expect(outline).toHaveLength(56);
    expect(outline[0][0]).toBeGreaterThan(4); // distal
    expect(outline[14][1]).toBeGreaterThan(4); // labial
    expect(outline[28][0]).toBeLessThan(-4); // mesial
    expect(outline[42][1]).toBeLessThan(-4); // lingual
  });
});
