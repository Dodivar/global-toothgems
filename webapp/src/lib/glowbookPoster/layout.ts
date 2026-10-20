import { QR_QUIET_ZONE } from "./qr";

/**
 * The Glowbook poster (decision 102): an A4 page an artist prints and puts up
 * in their studio — their identity colour, profile picture (or initials),
 * name and @handle, a call to scan, the QR code of their public page, its
 * short address and the Global Toothgems mark. Like the certificate
 * (`lib/certificate/layout.ts`), the page is a list of drawing operations in
 * millimetres; `components/glowbook/posterRender.ts` draws them on a canvas
 * for the PDF. Every label arrives ready-made in the artist's language.
 * Pure: unit-tested.
 */

export const POSTER_PAGE = { width: 210, height: 297 } as const;

/** The wordmark's aspect ratio (`assets/logo-wordmark-black.png`, 1019 × 281). */
export const WORDMARK_RATIO = 1019 / 281;

export const POSTER_INK = "#16171b";
export const POSTER_MUTED = "#5d6068";

export interface PosterContent {
  displayName: string;
  handle: string;
  /** The public page's absolute address, encoded in the QR code. */
  url: string;
  /** The identity colour (a solid, dark enough for white text on it). */
  accent: string;
  /** Whether a profile picture is drawn in the avatar slot (else the initials). */
  hasAvatar: boolean;
  initials: string;
  /** The QR code modules (`qrMatrix(url)`). */
  qr: readonly (readonly boolean[])[];
  labels: {
    /** Over the banner: "Glowbook". */
    eyebrow: string;
    /** "Scannez pour voir mes créations". */
    cta: string;
    /** Under the mark: "Créations conçues dans le Studio 3D Global Toothgems". */
    footer: string;
  };
}

export type PosterOp =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; radius?: number }
  | { kind: "circle"; cx: number; cy: number; r: number; fill: string }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      weight: 500 | 600 | 700 | 800;
      color: string;
      /** Squeezed horizontally when wider than this (long names). */
      fitWidth?: number;
    }
  | { kind: "avatar"; cx: number; cy: number; r: number }
  | { kind: "wordmark"; x: number; y: number; w: number; h: number }
  /** The code with its quiet zone inside `size`, dark modules in `color` on white. */
  | { kind: "qr"; x: number; y: number; size: number; modules: readonly (readonly boolean[])[]; color: string };

/** "https://www.globaltoothgems.com/fr/glowbook/lily/" → "globaltoothgems.com/fr/glowbook/lily". */
export function shortUrl(url: string): string {
  return url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "");
}

/** "glowbook-lily.gems-affiche.pdf": the handle is already file-name safe. */
export function posterFileName(handle: string, suffix: string, ext: "pdf" | "png"): string {
  const safeSuffix = suffix
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `glowbook-${handle.replace(/[^a-z0-9._-]/gi, "")}${safeSuffix ? `-${safeSuffix}` : ""}.${ext}`;
}

/** Text is centred on the page: x is the middle. */
const CENTER = POSTER_PAGE.width / 2;

export function layoutPoster(c: PosterContent): PosterOp[] {
  const ops: PosterOp[] = [];
  const band = 92;
  // Identity band and the page's name for it.
  ops.push({ kind: "rect", x: 0, y: 0, w: POSTER_PAGE.width, h: band, fill: c.accent });
  ops.push({ kind: "text", x: CENTER, y: 42, text: c.labels.eyebrow.toUpperCase(), size: 6, weight: 800, color: "#ffffff" });

  // Profile picture (or initials) astride the band.
  const avatar = { cx: CENTER, cy: band, r: 23 };
  ops.push({ kind: "circle", cx: avatar.cx, cy: avatar.cy, r: avatar.r + 2.2, fill: "#ffffff" });
  if (c.hasAvatar) {
    ops.push({ kind: "avatar", ...avatar });
  } else {
    ops.push({ kind: "circle", ...avatar, fill: c.accent });
    if (c.initials) ops.push({ kind: "text", x: CENTER, y: avatar.cy + 5.8, text: c.initials, size: 16, weight: 800, color: "#ffffff" });
  }

  ops.push({ kind: "text", x: CENTER, y: 136, text: c.displayName, size: 11, weight: 800, color: POSTER_INK, fitWidth: 180 });
  ops.push({ kind: "text", x: CENTER, y: 146, text: `@${c.handle}`, size: 5.5, weight: 600, color: POSTER_MUTED, fitWidth: 180 });
  ops.push({ kind: "text", x: CENTER, y: 162, text: c.labels.cta, size: 7, weight: 800, color: c.accent, fitWidth: 186 });

  // The code on a framed white card; modules always in ink (light colours do not scan).
  const card = { x: 58, y: 168, size: 94 };
  ops.push({ kind: "rect", x: card.x - 0.5, y: card.y - 0.5, w: card.size + 1, h: card.size + 1, fill: "#dfe1e6", radius: 4.5 });
  ops.push({ kind: "rect", x: card.x, y: card.y, w: card.size, h: card.size, fill: "#ffffff", radius: 4 });
  const qrSize = card.size - 6;
  ops.push({ kind: "qr", x: card.x + 3, y: card.y + 3, size: qrSize, modules: c.qr, color: POSTER_INK });

  ops.push({ kind: "text", x: CENTER, y: 272, text: shortUrl(c.url), size: 4.8, weight: 700, color: POSTER_INK, fitWidth: 186 });

  const mark = { h: 6.5 };
  const markW = mark.h * WORDMARK_RATIO;
  ops.push({ kind: "wordmark", x: CENTER - markW / 2, y: 279, w: markW, h: mark.h });
  ops.push({ kind: "text", x: CENTER, y: 292, text: c.labels.footer, size: 3.2, weight: 500, color: POSTER_MUTED, fitWidth: 186 });
  return ops;
}

/** Module size and canvas size for the QR code alone as a PNG: whole pixels per module, about `target` px wide. */
export function qrPngSize(moduleCount: number, target = 1200): { module: number; size: number } {
  const total = moduleCount + QR_QUIET_ZONE * 2;
  const module = Math.max(1, Math.floor(target / total));
  return { module, size: module * total };
}
