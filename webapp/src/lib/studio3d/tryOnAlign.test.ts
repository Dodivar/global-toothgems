import { describe, expect, it } from "vitest";
import { pastePlacement } from "./tryOnComposite";
import { alignCloseUp, ALIGN_WIDTH, IDENTITY_FIT, type Luma } from "./tryOnAlign";

/**
 * A drawn smile on the close-up's own coordinates (0–1 across, 0–1 down):
 * skin, the lips' opening, a row of teeth with dark gaps, some shading.
 */
function smile(u: number, v: number): number {
  const dx = (u - 0.5) / 0.38;
  const dy = (v - 0.52) / 0.3;
  if (dx * dx + dy * dy > 1) return 150 + 30 * Math.sin(u * 9) * Math.cos(v * 7); // skin and lips
  if (v > 0.6) return 40; // the dark inside of the mouth
  const tooth = ((u - 0.5) * 9 + 100) % 1;
  if (tooth < 0.08 || v > 0.585) return 70; // the gaps between teeth, the biting edge
  return 225 - 25 * Math.abs(u - 0.5);
}

/** `scene` drawn at `width` × `height`, each pixel the mean of 3 × 3 samples (smooth edges, like a photo). */
function draw(scene: (u: number, v: number) => number, width: number, height: number): Luma {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) sum += scene((x + (i + 0.5) / 3) / width, (y + (j + 0.5) / 3) / height);
      data[y * width + x] = sum / 9;
    }
  }
  return { width, height, data };
}

/** The AI's answer: the close-up's region `fit`, enlarged to the whole picture, with a few bright gems on the teeth. */
function answer(fit: { x: number; y: number; scale: number }) {
  return (u: number, v: number) => {
    const x = fit.x + u * fit.scale;
    const y = fit.y + v * fit.scale;
    const gem = [0.42, 0.5, 0.58].some((g) => Math.hypot(x - g, (y - 0.45) * 2.3) < 0.012);
    return gem ? 255 : smile(x, y);
  };
}

const W = ALIGN_WIDTH;
const H = Math.round(W / (21 / 9)); // the widest close-up the function cuts

describe("lining the AI's close-up up with the photo", () => {
  const original = draw(smile, W, H);

  it("leaves an answer that already lines up where it is (gems added, nothing moved)", () => {
    const result = alignCloseUp(original, draw(answer(IDENTITY_FIT), W, H));
    expect(result.fit).toEqual(IDENTITY_FIT);
  });

  it.each([
    { x: 0.1, y: 0.1, scale: 0.8 }, // zoomed in by 25 %, centred
    { x: 0.04, y: 0.12, scale: 0.86 }, // zoomed in and off-centre
    { x: 0.075, y: 0.05, scale: 0.9 },
  ])("finds where a zoomed-in answer really sits: %o", (fit) => {
    const result = alignCloseUp(original, draw(answer(fit), W, H));
    expect(result.fit.scale).toBeCloseTo(fit.scale, 2);
    expect(Math.abs(result.fit.x - fit.x)).toBeLessThan(0.01);
    expect(Math.abs(result.fit.y - fit.y)).toBeLessThan(0.02);
    expect(result.score).toBeGreaterThan(result.identityScore);
  });

  it("moves nothing when the answer does not match the photo at all", () => {
    const noise = (u: number, v: number) => (Math.sin(u * 517 + v * 91) * 43758.5453) % 1 > 0.5 ? 220 : 30;
    expect(alignCloseUp(original, draw(noise, W, H)).fit).toEqual(IDENTITY_FIT);
  });

  it("pastes a zoomed-in answer over the smaller region it shows", () => {
    const crop = { x: 100, y: 600, width: 1400, height: 600, photoWidth: 1536, photoHeight: 2048 };
    const place = pastePlacement(crop, { width: 1536, height: 2048 }, { x: 0.1, y: 0.1, scale: 0.8 });
    expect(place).toMatchObject({ x: 240, y: 660, width: 1120, height: 480 });
  });
});
