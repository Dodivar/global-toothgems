import { describe, expect, it } from "vitest";
import { A4_PORTRAIT_PT, jpegToPdf } from "../certificate/pdf";
import { layoutPoster, POSTER_INK, POSTER_PAGE, posterFileName, qrPngSize, shortUrl, type PosterContent } from "./layout";
import { qrMatrix, qrPath, QR_QUIET_ZONE } from "./qr";

const URL_FR = "https://globaltoothgems.com/fr/glowbook/lily.gems";

describe("qrMatrix", () => {
  it("encodes the address in a square matrix with the three finder patterns", () => {
    const m = qrMatrix(URL_FR);
    const n = m.length;
    expect(n).toBeGreaterThanOrEqual(21);
    expect((n - 17) % 4).toBe(0); // versions are 21, 25, 29… modules wide
    expect(m.every((row) => row.length === n)).toBe(true);
    // Finder patterns: dark 7×7 rings in three corners, light separator after them.
    for (const [r, c] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ]) {
      expect(m[r][c]).toBe(true);
      expect(m[r + 6][c + 6]).toBe(true);
      expect(m[r + 1][c + 1]).toBe(false);
      expect(m[r + 3][c + 3]).toBe(true);
    }
    expect(m[7][7]).toBe(false);
  });
  it("is deterministic and refuses nothing to encode", () => {
    expect(qrMatrix(URL_FR)).toEqual(qrMatrix(URL_FR));
    expect(qrMatrix(URL_FR)).not.toEqual(qrMatrix(URL_FR.replace("/fr/", "/en/")));
    expect(() => qrMatrix("")).toThrow();
  });
  it("draws runs of dark modules as one SVG path", () => {
    expect(qrPath([[true, true, false, true]], 4)).toBe("M4 4h2v1h-2zM7 4h1v1h-1z");
    expect(qrPath([[false]])).toBe("");
  });
});

describe("poster layout", () => {
  const content = (over: Partial<PosterContent> = {}): PosterContent => ({
    displayName: "Lily Gems Studio",
    handle: "lily.gems",
    url: URL_FR,
    accent: "#a8115f",
    hasAvatar: false,
    initials: "LG",
    qr: qrMatrix(URL_FR),
    labels: { eyebrow: "Glowbook", cta: "Scannez pour voir mes créations", footer: "Global Toothgems" },
    ...over,
  });

  it("holds the name, handle, call to action, short address, QR code and mark, inside the page", () => {
    const ops = layoutPoster(content());
    const texts = ops.flatMap((op) => (op.kind === "text" ? [op.text] : []));
    expect(texts).toEqual(["GLOWBOOK", "LG", "Lily Gems Studio", "@lily.gems", "Scannez pour voir mes créations", "globaltoothgems.com/fr/glowbook/lily.gems", "Global Toothgems"]);
    expect(ops.filter((op) => op.kind === "wordmark")).toHaveLength(1);
    const qr = ops.find((op) => op.kind === "qr");
    expect(qr).toMatchObject({ color: POSTER_INK });
    for (const op of ops) {
      if (op.kind === "text") expect(op.y).toBeLessThanOrEqual(POSTER_PAGE.height - 3);
      if (op.kind === "qr" || op.kind === "wordmark" || op.kind === "rect") {
        const w = op.kind === "qr" ? op.size : op.w;
        const h = op.kind === "qr" ? op.size : op.h;
        expect(op.x).toBeGreaterThanOrEqual(0);
        expect(op.x + w).toBeLessThanOrEqual(POSTER_PAGE.width);
        expect(op.y + h).toBeLessThanOrEqual(POSTER_PAGE.height);
      }
    }
  });
  it("uses the profile picture when there is one, the initials otherwise", () => {
    expect(layoutPoster(content({ hasAvatar: true })).some((op) => op.kind === "avatar")).toBe(true);
    expect(layoutPoster(content({ hasAvatar: true })).some((op) => op.kind === "text" && op.text === "LG")).toBe(false);
    expect(layoutPoster(content()).some((op) => op.kind === "avatar")).toBe(false);
  });
  it("keeps the QR code large enough to scan from a distance (≥ 0.8 mm per module)", () => {
    const qr = layoutPoster(content()).find((op) => op.kind === "qr");
    if (qr?.kind !== "qr") throw new Error("no QR");
    expect(qr.size / (qr.modules.length + QR_QUIET_ZONE * 2)).toBeGreaterThanOrEqual(0.8);
  });
});

describe("files", () => {
  it("shortens the address and names the files", () => {
    expect(shortUrl("https://www.globaltoothgems.com/en/glowbook/lily/")).toBe("globaltoothgems.com/en/glowbook/lily");
    expect(shortUrl("http://localhost:5173/fr/glowbook/x")).toBe("localhost:5173/fr/glowbook/x");
    expect(posterFileName("lily.gems", "Affiche à imprimer", "pdf")).toBe("glowbook-lily.gems-affiche-a-imprimer.pdf");
    expect(posterFileName("lily.gems", "", "png")).toBe("glowbook-lily.gems.png");
  });
  it("sizes the PNG in whole pixels per module", () => {
    expect(qrPngSize(29)).toEqual({ module: 32, size: 32 * 37 });
    expect(qrPngSize(1000, 10).module).toBe(1);
  });
  it("wraps a JPEG in an A4 portrait page", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const text = new TextDecoder().decode(jpegToPdf(jpeg, { width: 10, height: 14 }, { title: "Poster", author: "GT" }, A4_PORTRAIT_PT));
    expect(text).toContain("/MediaBox [0 0 595.28 841.89]");
    expect(new TextDecoder().decode(jpegToPdf(jpeg, { width: 10, height: 7 }, { title: "C", author: "GT" }))).toContain("/MediaBox [0 0 841.89 595.28]");
  });
});
