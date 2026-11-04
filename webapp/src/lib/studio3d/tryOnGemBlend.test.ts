import { describe, expect, it } from "vitest";
import { blendGems, MAX_BACKGROUND, type Rgba } from "./tryOnGemBlend";

const W = 220;
const H = 130;

/** A textured "photo": soft gradients, so nothing is flat. */
function photo(): Rgba {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = 150 + Math.round(40 * Math.sin(x / 17));
      data[i + 1] = 140 + Math.round(30 * Math.cos(y / 13));
      data[i + 2] = 130 + ((x + y) % 20);
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

/** The answer: the photo a little brighter, with red gems drawn at `gems`. */
function answer(base: Rgba, gems: { x: number; y: number; r: number }[], brighter = 6): Rgba {
  const data = new Uint8ClampedArray(base.data);
  for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) data[p * 4 + c] = base.data[p * 4 + c] + brighter;
  for (const g of gems) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (Math.hypot(x - g.x, y - g.y) > g.r) continue;
        const i = (y * W + x) * 4;
        data[i] = 230;
        data[i + 1] = 20;
        data[i + 2] = 40;
      }
    }
  }
  return { width: W, height: H, data };
}

const pixel = (data: ArrayLike<number>, x: number, y: number) => {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
};

describe("blendGems", () => {
  const marks = [
    { id: "on", x: 50, y: 60, r: 8 },
    { id: "beside", x: 120, y: 60, r: 8 },
    { id: "missing", x: 90, y: 105, r: 8 },
  ];
  const original = photo();
  // "on" drawn on its mark, "beside" 6 px to the right of it, "missing" not drawn, one gem drawn where there is no mark.
  const edited = answer(original, [
    { x: 50, y: 60, r: 8 },
    { x: 126, y: 60, r: 8 },
    { x: 195, y: 20, r: 8 },
  ]);
  const blend = blendGems(original, edited, marks);

  it("measures each gem: drawn or not, how far from its mark, how large", () => {
    expect(blend.masked).toBe(true);
    expect(blend.background).toBeLessThanOrEqual(MAX_BACKGROUND);
    const [on, beside, missing] = blend.checks;
    expect(on).toMatchObject({ id: "on", found: true });
    expect(on.drift!).toBeLessThan(0.15);
    expect(on.size!).toBeGreaterThan(0.85);
    expect(on.size!).toBeLessThan(1.2);
    expect(beside.found).toBe(true);
    expect(beside.drift!).toBeGreaterThan(0.6);
    expect(beside.drift!).toBeLessThan(0.9);
    expect(missing).toEqual({ id: "missing", found: false, drift: null, size: null });
  });

  it("keeps the photo everywhere but around the gems, and drops a gem drawn away from every mark", () => {
    expect(pixel(blend.data!, 5, 5)).toEqual(pixel(original.data, 5, 5));
    expect(pixel(blend.data!, 195, 20)).toEqual(pixel(original.data, 195, 20));
    expect(pixel(blend.data!, 90, 105)).toEqual(pixel(original.data, 90, 105));
  });

  it("keeps each drawn gem whole, even beside its mark, its surroundings matched to the photo", () => {
    expect(pixel(blend.data!, 50, 60)).toEqual([230 - 6, 20 - 6, 40 - 6]);
    expect(pixel(blend.data!, 132, 60)[0]).toBeGreaterThan(200);
    // Just outside the gem, inside the kept disc: the photo's colour, the answer's brightening taken out.
    const near = pixel(blend.data!, 50 + 10, 60);
    pixel(original.data, 60, 60).forEach((v, c) => expect(Math.abs(near[c] - v)).toBeLessThanOrEqual(1));
  });

  it("gives up cutting when the answer is not the photo any more, or the pictures do not match", () => {
    const noise = new Uint8ClampedArray(W * H * 4).map((_, i) => (i * 7919) % 256);
    const regenerated = blendGems(original, { width: W, height: H, data: noise }, marks);
    expect(regenerated.masked).toBe(false);
    expect(regenerated.data).toBeNull();
    expect(regenerated.background).toBeGreaterThan(MAX_BACKGROUND);
    const other = blendGems(original, { width: 10, height: 10, data: new Uint8ClampedArray(400) }, marks);
    expect(other.masked).toBe(false);
    expect(other.checks.every((c) => !c.found)).toBe(true);
  });
});
