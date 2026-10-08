import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { StudioShape } from "../../data/studioEditor";
import { footprintCovers, getJewelTemplate } from "./geometry";

/** Silhouette proportions measured on the shop's product photos (width / height). */
const PHOTO_ASPECT: [StudioShape, number][] = [
  ["raindrop", 0.286],
  ["navette", 0.514],
  ["starflower", 1.031],
  ["rivoli-star", 1.069],
  ["heart", 1.18],
  ["snake", 0.573],
  ["dachshund", 1.432],
];

function extent(shape: StudioShape) {
  const box = new THREE.Box3();
  for (const g of getJewelTemplate(shape).parts) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

describe("gem outlines traced from the shop photos", () => {
  it.each(PHOTO_ASPECT)("%s keeps the photo's proportions", (shape, aspect) => {
    const size = extent(shape).getSize(new THREE.Vector3());
    // the stars are drawn perfectly regular; the photos are up to 2 % wider than that
    expect(Math.abs(size.x / size.y - aspect)).toBeLessThan(0.025);
  });

  it.each(PHOTO_ASPECT.map(([s]) => s))("%s faces every facet outwards", (shape) => {
    const back = extent(shape).min.z;
    for (const g of getJewelTemplate(shape).parts) {
      const pos = (g.index ? g.toNonIndexed() : g).attributes.position as THREE.BufferAttribute;
      const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (let i = 0; i < pos.count; i += 3) {
        v.forEach((p, k) => p.fromBufferAttribute(pos, i + k));
        const normal = new THREE.Vector3().crossVectors(v[1].clone().sub(v[0]), v[2].clone().sub(v[0]));
        if (normal.lengthSq() < 1e-14) continue;
        // the flat back faces the tooth; everything else (edge walls are vertical) faces the viewer
        if (v.every((p) => Math.abs(p.z - back) < 1e-6)) expect(normal.z).toBeLessThan(0);
        else expect(normal.z).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it.each([
    ["starflower", 0.666],
    ["rivoli-star", 0.503],
  ] as [StudioShape, number][])("%s has its valleys at the photo's depth", (shape, valley) => {
    const { footprint } = getJewelTemplate(shape);
    const box = extent(shape);
    // the star's centre, as on the photo: the centre of its tips (top tip and the two lower ones)
    const top = box.max.y;
    const r = (top - box.min.y) / (1 + Math.cos(Math.PI / 5));
    const cy = top - r;
    // walk out from the centre towards the valley between the top and the right point
    const a = Math.PI / 2 - Math.PI / 5;
    let reach = 0;
    for (let s = 0; s < r * 1.2; s += footprint.cell / 4) {
      if (footprintCovers(footprint, Math.cos(a) * s, cy + Math.sin(a) * s)) reach = s;
      else break;
    }
    expect(reach / r).toBeCloseTo(valley, 1);
  });
});
