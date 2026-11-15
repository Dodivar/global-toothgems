import { describe, expect, it } from "vitest";
import {
  ACCENT_COLORS,
  ACCENTS,
  coverCrop,
  DEFAULT_LOOK,
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

describe("identity colours", () => {
  it.each(ACCENTS)("%s keeps white text readable on it and reads on the light page", (accent) => {
    const c = ACCENT_COLORS[accent];
    expect(contrast(c.solid, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.solid, "#fbfbfc")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.bright, "#141519")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("lookFromColumns / pendingFromColumns", () => {
  it("reads a row, falling back on the defaults for unknown values and ignoring outside links (decision 146)", () => {
    const look = lookFromColumns({ accent: "teal", background: "neon", layout: "large", location: "Lyon", avatar_path: "u/a.jpg", tiktok: "lily", booking_url: "https://x.example" });
    expect(look).toEqual({ ...DEFAULT_LOOK, accent: "teal", layout: "large", location: "Lyon", avatarPath: "u/a.jpg" });
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
    const to = { ...from, accent: "plum" as const, avatarPath: null };
    expect(lookPatch(from, to)).toEqual({ accent: "plum", avatar_path: null });
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
