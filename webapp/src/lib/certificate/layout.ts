/**
 * The certificate, drawn once.
 *
 * The document exists twice — on screen (an inline SVG, `CertificateDocument`)
 * and as the file the member downloads (a canvas, `render.ts`). Both draw the
 * list of operations this module returns, on the same A4-landscape page in
 * millimetres, so the PDF is exactly what the screen showed. Text is placed and
 * fitted with an estimate of Montserrat's advance widths instead of measuring
 * it: the estimate is the same on the server, in the browser and in the
 * exporter, so the server-rendered course page and its hydration agree.
 *
 * Every position is a constant: nothing random, nothing read from the clock.
 * Pure: no DOM. Unit-tested in `layout.test.ts`.
 */

export const PAGE = { width: 297, height: 210 } as const;

/** What the document prints, already translated and formatted. */
export interface CertificateContent {
  brand: string;
  academy: string;
  title: string;
  awardedTo: string;
  holder: string;
  statement: string;
  courseTitle: string;
  details: string;
  dateLabel: string;
  date: string;
  referenceLabel: string;
  reference: string;
  seal: string;
  issuer: string;
  issuerLabel: string;
}

export const INK = {
  paper: "#fafaf8",
  ink: "#111111",
  body: "#444444",
  muted: "#5c5c5c",
  subtle: "#8a8a8a",
  rule: "#c9c9c7",
  hairline: "#e4e3df",
  white: "#ffffff",
  blue200: "#d3e0ef",
  blue300: "#b9cde5",
  blue500: "#7a95b8",
  blue600: "#5a7796",
  emerald50: "#e4f9f0",
  emerald400: "#3edba0",
  emerald600: "#0b7e5b",
  fuchsia300: "#f59cc7",
  fuchsia400: "#e0479b",
} as const;

export interface GradientStop {
  offset: number;
  color: string;
}
export type Paint =
  | string
  | { kind: "linear"; x1: number; y1: number; x2: number; y2: number; stops: GradientStop[] }
  | { kind: "radial"; cx: number; cy: number; r: number; stops: GradientStop[] };

interface Shape {
  fill?: Paint;
  stroke?: Paint;
  lineWidth?: number;
  opacity?: number;
}

export type CertificateOp =
  | ({ kind: "rect"; x: number; y: number; w: number; h: number } & Shape)
  | ({ kind: "circle"; cx: number; cy: number; r: number } & Shape)
  | ({ kind: "path"; d: string } & Shape)
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      weight: 400 | 500 | 600 | 700;
      color: string;
      align: "start" | "middle" | "end";
      /** Letter spacing, in em. */
      tracking: number;
      italic?: boolean;
      mono?: boolean;
      /** Set when the estimate overflows: the line is squeezed to this width. */
      fitWidth?: number;
    };

/* -------------------------------------------------------------------------- */
/* Text estimates                                                             */
/* -------------------------------------------------------------------------- */

const NARROW = new Set("iljtfrI.,:;'’!|() -·");
const WIDE = new Set("mwMW@");

/** Approximate advance of one character in Montserrat, in em. */
function advance(ch: string, mono: boolean): number {
  if (mono) return 0.6;
  if (NARROW.has(ch)) return 0.32;
  if (WIDE.has(ch)) return 0.88;
  if (ch >= "0" && ch <= "9") return 0.64;
  if (ch !== ch.toLowerCase()) return 0.72;
  return 0.59;
}

/** Estimated width of a line, in the same unit as `size`. */
export function textWidth(text: string, size: number, weight = 400, tracking = 0, mono = false): number {
  const chars = Array.from(text);
  const glyphs = chars.reduce((sum, ch) => sum + advance(ch, mono), 0);
  const boldness = weight >= 700 ? 1.07 : weight >= 600 ? 1.04 : 1;
  return (glyphs * boldness + tracking * Math.max(0, chars.length - 1)) * size;
}

/** The largest size, down to `min`, at which one line fits `max`. */
export function fitSize(text: string, size: number, max: number, min: number, weight = 400, tracking = 0): number {
  const width = textWidth(text, size, weight, tracking);
  if (width <= max) return size;
  return Math.max(min, Math.floor((size * max) / width * 10) / 10);
}

/** Splits a title into at most `lines` lines that fit `max`; the last one may still overflow. */
export function wrapLines(text: string, size: number, max: number, weight: number, lines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, size, weight) > max && out.length < lines - 1) {
      out.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) out.push(line);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

/** A four-pointed sparkle centred on (cx, cy). */
export function sparklePath(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;
}

/** A cut gem seen from the side, in the box (x, y, w, h): outline then facets. */
export function gemPaths(x: number, y: number, w: number, h: number): { outline: string; facets: string } {
  const px = (f: number) => +(x + w * f).toFixed(2);
  const py = (f: number) => +(y + h * f).toFixed(2);
  const outline = `M${px(0.24)} ${py(0)}L${px(0.76)} ${py(0)}L${px(1)} ${py(0.34)}L${px(0.5)} ${py(1)}L${px(0)} ${py(0.34)}Z`;
  const facets =
    `M${px(0)} ${py(0.34)}L${px(1)} ${py(0.34)}` +
    `M${px(0.24)} ${py(0)}L${px(0.36)} ${py(0.34)}L${px(0.5)} ${py(0)}L${px(0.64)} ${py(0.34)}L${px(0.76)} ${py(0)}` +
    `M${px(0.36)} ${py(0.34)}L${px(0.5)} ${py(1)}L${px(0.64)} ${py(0.34)}`;
  return { outline, facets };
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                     */
/* -------------------------------------------------------------------------- */

const CX = PAGE.width / 2;
const FRAME = 9.5;
const INNER = 11.5;

export function layoutCertificate(content: CertificateContent): CertificateOp[] {
  const ops: CertificateOp[] = [];
  const text = (op: Omit<Extract<CertificateOp, { kind: "text" }>, "kind">) => ops.push({ kind: "text", ...op });

  /* Paper: off-white, washed with the brand's pastel blue from the top-left,
     a breath of emerald at the bottom-right and of pink at the top-right. */
  ops.push({ kind: "rect", x: 0, y: 0, w: PAGE.width, h: PAGE.height, fill: INK.paper });
  ops.push({
    kind: "rect", x: 0, y: 0, w: PAGE.width, h: PAGE.height,
    fill: { kind: "radial", cx: 20, cy: 0, r: 190, stops: [{ offset: 0, color: "rgba(211,224,239,0.85)" }, { offset: 1, color: "rgba(244,248,252,0)" }] },
  });
  ops.push({
    kind: "rect", x: 0, y: 0, w: PAGE.width, h: PAGE.height,
    fill: { kind: "radial", cx: 297, cy: 210, r: 150, stops: [{ offset: 0, color: "rgba(228,249,240,0.95)" }, { offset: 1, color: "rgba(228,249,240,0)" }] },
  });
  ops.push({
    kind: "rect", x: 0, y: 0, w: PAGE.width, h: PAGE.height,
    fill: { kind: "radial", cx: 290, cy: 10, r: 60, stops: [{ offset: 0, color: "rgba(253,234,243,0.8)" }, { offset: 1, color: "rgba(253,234,243,0)" }] },
  });

  // A double frame: a warm hairline and, inside it, a pastel-blue one.
  ops.push({ kind: "rect", x: FRAME, y: FRAME, w: PAGE.width - FRAME * 2, h: PAGE.height - FRAME * 2, stroke: INK.hairline, lineWidth: 0.35 });
  ops.push({ kind: "rect", x: INNER, y: INNER, w: PAGE.width - INNER * 2, h: PAGE.height - INNER * 2, stroke: INK.blue300, lineWidth: 0.22 });

  // A diamond where the inner frame turns each corner.
  for (const [x, y] of [[INNER, INNER], [PAGE.width - INNER, INNER], [INNER, PAGE.height - INNER], [PAGE.width - INNER, PAGE.height - INNER]]) {
    ops.push({ kind: "path", d: `M${x} ${y - 1.6}L${x + 1.6} ${y}L${x} ${y + 1.6}L${x - 1.6} ${y}Z`, fill: INK.paper, stroke: INK.blue500, lineWidth: 0.25 });
  }

  // The brand's stone as a watermark behind the holder and the course, and a few sparkles.
  const watermark = gemPaths(CX - 62, 56, 124, 100);
  ops.push({ kind: "path", d: watermark.outline, fill: "rgba(255,255,255,0.35)", stroke: INK.blue200, lineWidth: 0.35, opacity: 0.8 });
  ops.push({ kind: "path", d: watermark.facets, stroke: INK.blue200, lineWidth: 0.25, opacity: 0.8 });
  ops.push({ kind: "path", d: sparklePath(46, 30, 2.2), fill: INK.emerald400, opacity: 0.85 });
  ops.push({ kind: "path", d: sparklePath(251, 28, 1.6), fill: INK.fuchsia300 });
  ops.push({ kind: "path", d: sparklePath(258, 37, 1), fill: INK.blue500, opacity: 0.7 });

  /* Header: the wordmark and the Academy. */
  const brand = content.brand.toUpperCase();
  const brandWidth = textWidth(brand, 3.4, 600, 0.32);
  ops.push({ kind: "path", d: sparklePath(CX - brandWidth / 2 - 4.2, 25.6 - 1.2, 1.9), fill: INK.blue500 });
  text({ x: CX, y: 26, text: brand, size: 3.4, weight: 600, color: INK.ink, align: "middle", tracking: 0.32 });
  text({ x: CX, y: 32, text: content.academy.toUpperCase(), size: 2.2, weight: 600, color: INK.blue600, align: "middle", tracking: 0.5 });

  /* The document's title, then the two focal points: the holder and the course. */
  text({ x: CX, y: 57, text: content.title.toUpperCase(), size: 4.4, weight: 600, color: INK.blue600, align: "middle", tracking: 0.2 });
  text({ x: CX, y: 71, text: content.awardedTo, size: 3.4, weight: 400, color: INK.muted, align: "middle", tracking: 0, italic: true });

  const holderMax = 230;
  const holderSize = fitSize(content.holder, 14, holderMax, 8, 700, -0.02);
  const holderFits = textWidth(content.holder, holderSize, 700, -0.02) <= holderMax;
  text({
    x: CX, y: 89, text: content.holder, size: holderSize, weight: 700, color: INK.ink, align: "middle", tracking: -0.02,
    fitWidth: holderFits ? undefined : holderMax,
  });

  // The rule under the name: blue into emerald and back, a pink stone at its centre.
  ops.push({
    kind: "path", d: `M${CX - 34} 98H${CX + 34}`, lineWidth: 0.5,
    stroke: { kind: "linear", x1: CX - 34, y1: 98, x2: CX + 34, y2: 98, stops: [
      { offset: 0, color: "rgba(185,205,229,0)" }, { offset: 0.3, color: INK.blue300 }, { offset: 0.5, color: INK.emerald400 },
      { offset: 0.7, color: INK.blue300 }, { offset: 1, color: "rgba(185,205,229,0)" },
    ] },
  });
  ops.push({ kind: "path", d: `M${CX} 96.2L${CX + 1.8} 98L${CX} 99.8L${CX - 1.8} 98Z`, fill: INK.fuchsia400 });

  text({ x: CX, y: 109, text: content.statement, size: 3.4, weight: 400, color: INK.muted, align: "middle", tracking: 0, italic: true });

  const titleMax = 205;
  const titleSize = fitSize(content.courseTitle, 7.4, titleMax * 2 - 20, 5, 600) === 7.4 ? 7.4 : 6.2;
  const titleLines = wrapLines(content.courseTitle, titleSize, titleMax, 600, 2);
  titleLines.forEach((line, i) => {
    const fits = textWidth(line, titleSize, 600, -0.01) <= titleMax;
    text({
      x: CX, y: 121 + i * titleSize * 1.2, text: line, size: titleSize, weight: 600, color: INK.ink, align: "middle", tracking: -0.01,
      fitWidth: fits ? undefined : titleMax,
    });
  });
  const detailsY = 121 + (titleLines.length - 1) * titleSize * 1.2 + 9;
  if (content.details) {
    text({ x: CX, y: detailsY, text: content.details.toUpperCase(), size: 2.4, weight: 500, color: INK.subtle, align: "middle", tracking: 0.14 });
  }

  /* Footer: when and which (left), the seal (centre), who issues it (right). */
  const left = 36;
  text({ x: left, y: 168, text: content.dateLabel.toUpperCase(), size: 2.1, weight: 600, color: INK.subtle, align: "start", tracking: 0.16 });
  text({ x: left, y: 175, text: content.date, size: 3.8, weight: 600, color: INK.ink, align: "start", tracking: 0 });
  text({ x: left, y: 184, text: content.referenceLabel.toUpperCase(), size: 2.1, weight: 600, color: INK.subtle, align: "start", tracking: 0.16 });
  text({ x: left, y: 190, text: content.reference, size: 2.9, weight: 500, color: INK.body, align: "start", tracking: 0.04, mono: true });

  const sealY = 174;
  ops.push({
    kind: "circle", cx: CX, cy: sealY, r: 15, lineWidth: 0.9,
    stroke: { kind: "linear", x1: CX - 15, y1: sealY - 15, x2: CX + 15, y2: sealY + 15, stops: [
      { offset: 0, color: INK.blue300 }, { offset: 0.55, color: INK.emerald400 }, { offset: 1, color: INK.blue300 },
    ] },
  });
  ops.push({ kind: "circle", cx: CX, cy: sealY, r: 12.8, fill: INK.white, stroke: INK.blue200, lineWidth: 0.25 });
  const gem = gemPaths(CX - 5.5, sealY - 8.2, 11, 8.6);
  ops.push({ kind: "path", d: gem.outline, fill: INK.emerald50, stroke: INK.emerald600, lineWidth: 0.35 });
  ops.push({ kind: "path", d: gem.facets, stroke: INK.emerald600, lineWidth: 0.22 });
  text({ x: CX, y: sealY + 6.4, text: content.seal.toUpperCase(), size: 1.75, weight: 700, color: INK.emerald600, align: "middle", tracking: 0.2 });
  ops.push({ kind: "path", d: sparklePath(CX + 17.5, sealY - 12, 1.5), fill: INK.fuchsia300 });
  ops.push({ kind: "path", d: sparklePath(CX - 18, sealY + 10, 1.1), fill: INK.blue500, opacity: 0.7 });

  const right = PAGE.width - 36;
  const issuerSize = fitSize(content.issuer, 4.6, 66, 3.2, 400);
  text({ x: right, y: 177, text: content.issuer, size: issuerSize, weight: 400, color: INK.ink, align: "end", tracking: -0.01, italic: true });
  ops.push({ kind: "path", d: `M${right - 62} 181.5H${right}`, stroke: INK.rule, lineWidth: 0.3 });
  text({ x: right, y: 187, text: content.issuerLabel.toUpperCase(), size: 2.1, weight: 600, color: INK.subtle, align: "end", tracking: 0.16 });

  return ops;
}
