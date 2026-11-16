import { describe, expect, it } from "vitest";
import {
  coverCrop,
  DEFAULT_LOOK,
  GLOWBOOK_COLORS,
  lookFromColumns,
  lookPatch,
  pendingFromColumns,
  validateLook,
} from "./glowbookLook";

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe("Glowbook colours (decisions 150 and 152)", () => {
  it("keep white text readable on the deep blue, which reads on the pale blue page and on its soft band", () => {
    expect(contrast(GLOWBOOK_COLORS.solid, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(GLOWBOOK_COLORS.solid, "#f4f8fc")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(GLOWBOOK_COLORS.solid, GLOWBOOK_COLORS.soft)).toBeGreaterThanOrEqual(4.5);
  });
  it("keep ink text readable on the green call to action", () => {
    expect(contrast("#111111", GLOWBOOK_COLORS.cta)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("lookFromColumns / pendingFromColumns", () => {
  it("reads a row, ignoring outside links (decision 146) and the former colour, background and layout (decision 150)", () => {
    const look = lookFromColumns({ accent: "teal", background: "dark", layout: "large", location: "Lyon", avatar_path: "u/a.jpg", tiktok: "lily", booking_url: "https://x.example" });
    expect(look).toEqual({ ...DEFAULT_LOOK, location: "Lyon", avatarPath: "u/a.jpg" });
    expect(lookFromColumns(null)).toEqual(DEFAULT_LOOK);
  });
  it("reads what waits for a moderator, pictures only", () => {
    expect(pendingFromColumns({ avatar_path: "u/b.jpg", booking_url: "https://x.example", tiktok: "lily", accent: "gold" })).toEqual({
      avatarPath: "u/b.jpg",
    });
    expect(pendingFromColumns(null)).toEqual({});
  });
});

describe("lookPatch", () => {
  it("sends only what changed, in column names, null to remove", () => {
    const from = { ...DEFAULT_LOOK, avatarPath: "u/a.jpg" };
    const to = { ...from, location: "Lyon", avatarPath: null };
    expect(lookPatch(from, to)).toEqual({ location: "Lyon", avatar_path: null });
    expect(lookPatch(from, from)).toEqual({});
  });
});

describe("validateLook", () => {
  it("checks the city's length", () => {
    expect(validateLook(DEFAULT_LOOK)).toBeNull();
    expect(validateLook({ ...DEFAULT_LOOK, location: "x".repeat(61) })).toBe("locationLength");
  });
});

describe("coverCrop", () => {
  it("keeps the centre of a wide picture for a square", () => {
    expect(coverCrop(1600, 900, 1)).toEqual({ sx: 350, sy: 0, sw: 900, sh: 900 });
  });
  it("keeps the centre of a tall picture for a 3:1 banner", () => {
    expect(coverCrop(1200, 1600, 3)).toEqual({ sx: 0, sy: 600, sw: 1200, sh: 400 });
  });
  it("leaves a picture already at the ratio whole", () => {
    expect(coverCrop(1500, 500, 3)).toEqual({ sx: 0, sy: 0, sw: 1500, sh: 500 });
  });
});
