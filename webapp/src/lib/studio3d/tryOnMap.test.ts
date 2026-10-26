import { describe, expect, it } from "vitest";
import { sanitizeScene } from "../studioWorkspace/scene";
import { tryOnMap } from "./tryOnMap";
import { tryOnSeats } from "./tryOnSeats";

const GEM = "c654aad1-58a7-42f4-bc3d-f74b7a809dc9";
const piece = (id: string, shape: string, color: string, toothId: string, position: number[], normal: number[]) => ({
  id,
  look: { color, shape, effect: "none", material: "crystal" },
  size: { mm: [4] },
  scale: 2,
  normal: { x: normal[0], y: normal[1], z: normal[2] },
  toothId,
  position: { x: position[0], y: position[1], z: position[2] },
  rotation: 0,
  productId: GEM,
});

// From the "test ia" creation: a drop and a heart on 11, a plump star on 12, a sharp star on 41, a gem on the tongue side of 21.
const scene = sanitizeScene({
  model: "dentition",
  version: 2,
  pieces: [
    piece("drop", "raindrop", "#56a1cb", "11", [-3.325, 6.777, 4.335], [0.1, 0.099, 0.99]),
    piece("heart", "heart", "#a9bd86", "11", [-1.722, 3.725, 4.43], [0.117, 0.057, 0.991]),
    piece("plump", "starflower", "#e7d174", "12", [-12.214, 4.759, 1.696], [-0.261, 0.023, 0.965]),
    piece("sharp", "rivoli-star", "#067cfc", "41", [-2.531, -3.917, -1.804], [-0.006, -0.184, 0.983]),
    piece("back", "round", "#123456", "21", [2, 4, -2], [0, 0, -1]),
  ],
});
const map = tryOnMap(scene.pieces, scene.model, tryOnSeats(scene.pieces, scene.model));
const texts = [...map.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe("tryOnMap", () => {
  it("is a standalone SVG of its own size", () => {
    expect(map.svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${map.width}" height="${map.height}"`)).toBe(true);
    expect(map.width).toBeGreaterThan(800);
    expect(map.height).toBeGreaterThan(600);
  });

  it("numbers every tooth from canine to canine, names the midline and the sides", () => {
    for (const fdi of ["13", "12", "11", "21", "22", "23", "43", "42", "41", "31", "32", "33"]) expect(texts).toContain(fdi);
    expect(texts).toContain("MIDLINE");
    expect(texts.some((t) => t.includes("PERSON'S RIGHT"))).toBe(true);
    expect(texts.some((t) => t.includes("PERSON'S LEFT"))).toBe(true);
  });

  it("tags each front gem like the design data; a tongue-side gem is not drawn", () => {
    expect(texts.filter((t) => /^[1-4][1-8][a-z]$/.test(t)).sort()).toEqual(["11a", "11b", "12a", "41a"]);
    expect(map.svg).not.toContain("#123456");
    // Tooth 21 carries only the tongue-side gem: it is drawn bare.
    expect(texts.filter((t) => t === "no").length).toBeGreaterThanOrEqual(5);
  });

  it("draws each star cut with its own outline", () => {
    const outline = (color: string) => new RegExp(`<path d="([^"]+)" fill="${color}"`).exec(map.svg)?.[1] ?? "";
    // The plump star's corners are curves, the sharp star's are straight lines.
    expect(outline("#e7d174")).toContain("C");
    expect(outline("#067cfc")).not.toContain("C");
  });

  it("shows no more teeth than needed, one beyond the outermost gem", () => {
    const far = sanitizeScene({ model: "dentition", version: 2, pieces: [piece("pm", "round", "#ffffff", "15", [-22, 4, -6], [-0.8, 0, 0.6])] });
    const wide = tryOnMap(far.pieces, far.model, tryOnSeats(far.pieces, far.model));
    const labels = [...wide.svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
    expect(labels).toContain("15a");
    expect(labels).toContain("16");
    expect(labels).not.toContain("17");
    expect(texts).not.toContain("15");
  });
});
