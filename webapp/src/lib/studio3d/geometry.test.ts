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
];

function extent(shape: StudioShape) {
  const box = new THREE.Box3();
  for (const g of getJewelTemplate(shape).parts) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  return box;
}

describe("measured gem cuts", () => {
  it.each(PHOTO_ASPECT)("%s keeps the photo's proportions", (shape, aspect) => {
    const size = extent(shape).getSize(new THREE.Vector3());
    // the stars are drawn perfectly regular; the photos are up to 2 % wider than that
    expect(Math.abs(size.x / size.y - aspect)).toBeLessThan(0.025);
  });

  it.each(PHOTO_ASPECT.map(([s]) => s))("%s faces every crown facet outwards", (shape) => {
    for (const g of getJewelTemplate(shape).parts) {
      const pos = g.attributes.position as THREE.BufferAttribute;
      const a = new THREE.Vector3(),
        b = new THREE.Vector3(),
        c = new THREE.Vector3();
      const tpl = getJewelTemplate(shape);
      for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
        if (normal.lengthSq() < 1e-14) continue;
        const z = (a.z + b.z + c.z) / 3;
        // crown facets (above the girdle) face the viewer; the flat back faces the tooth
        if (z > -tpl.halfDepth + 0.05) expect(normal.z).toBeGreaterThanOrEqual(-1e-9);
        else if (Math.abs(normal.x) + Math.abs(normal.y) < 1e-9) expect(normal.z).toBeLessThan(0);
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
