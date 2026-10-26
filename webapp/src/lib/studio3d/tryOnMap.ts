import { LOWER_TEETH, UPPER_TEETH, type PlacedJewelry, type StudioShape } from "../../data/studioEditor";
import type { SceneModel } from "../studioWorkspace/scene";
import {
  GLYPH_SPAN,
  SHAPE_OUTLINES,
  crownOutline,
  pathToSvg,
  projectFrontView,
  type FrontViewGem,
  type FrontViewPathCommand,
  type FrontViewTooth,
} from "./frontView";
import type { TryOnSeat } from "./tryOnSeats";

/**
 * The flat design map sent to the smile try-on's image model as IMAGE 3,
 * beside the 3D render (decision 111, fifth round): a labelled chart of the
 * front teeth, drawn to be read by a model rather than by a person.
 *
 * Against what went wrong with the first flat map (generic grey outlines,
 * one outline for every star, gems slid onto the next tooth):
 * - every crown is its own box, with a gap to its neighbours, and its FDI
 *   number written outside it — above the upper arch, below the lower one;
 * - the midline is drawn and named, the person's right and left are written;
 * - teeth without a gem are greyed out and say "no gem";
 * - each gem carries the tag of the design data ("11a", "11b": its tooth, then
 *   a letter from the gum side, `tryOnSeats`) in a row outside the crowns,
 *   with a leader line ending on the gem's edge — never on the gem itself;
 * - each cut has its own silhouette: a sharp star, a plump star, a hollow
 *   star and a hollow heart are told apart.
 *
 * Crowns keep the Studio front view's widths and heights (`frontView.ts`),
 * which the seats sent as text were measured on, so the map, the data and a
 * face-on photo agree on each gem's size against its tooth. Gems on the
 * tongue side, and those without a tooth frame, are not drawn (the data
 * leaves them out too).
 *
 * The result is an SVG string in pixels, with literal colours and a system
 * font (an SVG drawn through an image cannot load web fonts). Pure: no DOM.
 */

/** Pixels per millimetre of the front view. */
const PX = 18;
/** Gap between two crowns, px. */
const GAP = 24;
const MARGIN_LEFT = 196;
const MARGIN = 36;
const HEADING = 92;
const NUMBER_ROW = 52;
const TAG_ROW = 54;
const GUM = 22;
const BETWEEN = 96;

const TAG_W = 64;
const TAG_H = 34;
const TAG_GAP = 8;

const FONT = "Arial, Helvetica, sans-serif";
const INK = "#1d2733";
const MUTED = "#8a8f96";
const BARE_FILL = "#e3e5e8";
const ENAMEL = "#fffdf7";
const GUM_FILL = "#f2c6cb";
const MIDLINE = "#c0392b";
const GEM_EDGE = "#1d2733";

export interface TryOnMap {
  svg: string;
  width: number;
  height: number;
}

interface Slot {
  tooth: FrontViewTooth;
  /** Left edge and width, px. */
  left: number;
  width: number;
  height: number;
  gems: FrontViewGem[];
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The teeth drawn on one arch: canine to canine at least, and one tooth beyond the outermost gem. */
function shownTeeth(order: readonly string[], withGems: ReadonlySet<string>, available: ReadonlySet<string>): string[] {
  const listed = order.filter((fdi) => available.has(fdi));
  let first = listed.findIndex((fdi) => fdi[1] === "3");
  let last = listed.length - 1 - [...listed].reverse().findIndex((fdi) => fdi[1] === "3");
  listed.forEach((fdi, i) => {
    if (!withGems.has(fdi)) return;
    first = Math.min(first, i - 1);
    last = Math.max(last, i + 1);
  });
  return listed.slice(Math.max(0, first), Math.min(listed.length, last + 1));
}

/* ------------------------------------------------------------ silhouettes */

/** A star on the 16-unit glyph grid: `inner` is the inner radius as a share of the outer one. */
function starPoints(inner: number): [number, number][] {
  const outer = GLYPH_SPAN / 2;
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : outer * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [8 + r * Math.cos(a), 8.6 + r * Math.sin(a)];
  });
}

/** A sharp polygon. */
function polygon(points: [number, number][]): FrontViewPathCommand[] {
  return [["M", ...points[0]], ...points.slice(1).map((p): FrontViewPathCommand => ["L", ...p]), ["Z"]];
}

/** A polygon with rounded corners: plump tips (`tip`) and softer inner corners (`notch`), as shares of each side. */
function rounded(points: [number, number][], tip: number, notch: number): FrontViewPathCommand[] {
  const out: FrontViewPathCommand[] = [];
  const n = points.length;
  points.forEach((v, i) => {
    const prev = points[(i + n - 1) % n];
    const next = points[(i + 1) % n];
    const t = i % 2 === 0 ? tip : notch;
    const a: [number, number] = [v[0] + (prev[0] - v[0]) * t, v[1] + (prev[1] - v[1]) * t];
    const b: [number, number] = [v[0] + (next[0] - v[0]) * t, v[1] + (next[1] - v[1]) * t];
    out.push(i === 0 ? ["M", ...a] : ["L", ...a]);
    // A quadratic corner through the vertex, as a cubic.
    out.push(["C", a[0] + (v[0] - a[0]) * (2 / 3), a[1] + (v[1] - a[1]) * (2 / 3), b[0] + (v[0] - b[0]) * (2 / 3), b[1] + (v[1] - b[1]) * (2 / 3), ...b]);
  });
  out.push(["Z"]);
  return out;
}

const SHARP_STAR = polygon(starPoints(0.4));
const PLUMP_STAR = rounded(starPoints(0.58), 0.32, 0.18);

/** The outline of each cut, and whether it is drawn hollow (a wire outline). */
function silhouette(shape: StudioShape): { outline: FrontViewPathCommand[]; hollow: boolean } {
  switch (shape) {
    case "rivoli-star":
      return { outline: SHARP_STAR, hollow: false };
    case "starflower":
      return { outline: PLUMP_STAR, hollow: false };
    case "halo-star":
      return { outline: SHARP_STAR, hollow: true };
    case "open-heart":
      return { outline: SHAPE_OUTLINES.heart, hollow: true };
    default:
      return { outline: SHAPE_OUTLINES[shape] ?? SHAPE_OUTLINES.round, hollow: false };
  }
}

/** Place a 16-unit outline: centred on (x, y), its longest side 2r, stretched and turned. */
function place(
  outline: FrontViewPathCommand[],
  at: { x: number; y: number; r: number; rotation: number; stretch: readonly [number, number] },
): FrontViewPathCommand[] {
  const s = (at.r * 2) / GLYPH_SPAN;
  const a = (at.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const map = (gx: number, gy: number): [number, number] => {
    const lx = (gx - 8) * s * at.stretch[0];
    const ly = (gy - 8) * s * at.stretch[1];
    return [at.x + lx * cos - ly * sin, at.y + lx * sin + ly * cos];
  };
  return outline.map((cmd): FrontViewPathCommand => {
    if (cmd[0] === "Z") return cmd;
    if (cmd[0] === "C") return ["C", ...map(cmd[1], cmd[2]), ...map(cmd[3], cmd[4]), ...map(cmd[5], cmd[6])];
    return [cmd[0], ...map(cmd[1], cmd[2])];
  });
}

/* --------------------------------------------------------------- the map */

interface DrawnGem {
  tag: string;
  x: number;
  y: number;
  r: number;
  svg: string;
}

interface Tag {
  tag: string;
  /** Wanted centre, then the centre after spreading. */
  want: number;
  x: number;
  gem: DrawnGem;
}

/** Spread tags along a row so they never overlap, keeping each as near as possible to its gem. */
function spread(tags: Tag[]): void {
  tags.sort((a, b) => a.want - b.want);
  const step = TAG_W + TAG_GAP;
  // Clusters of tags that touch are centred on their gems' mean, then merged while they overlap.
  const groups = tags.map((t) => ({ tags: [t], centre: t.want }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i + 1 < groups.length; i++) {
      const a = groups[i];
      const b = groups[i + 1];
      const aEnd = a.centre + ((a.tags.length - 1) * step) / 2;
      const bStart = b.centre - ((b.tags.length - 1) * step) / 2;
      if (bStart - aEnd < step) {
        const all = [...a.tags, ...b.tags];
        groups.splice(i, 2, { tags: all, centre: all.reduce((sum, t) => sum + t.want, 0) / all.length });
        merged = true;
        break;
      }
    }
  }
  for (const g of groups) g.tags.forEach((t, i) => (t.x = g.centre + (i - (g.tags.length - 1) / 2) * step));
}

export function tryOnMap(pieces: readonly PlacedJewelry[], model: SceneModel, seats: readonly TryOnSeat[]): TryOnMap {
  const projection = projectFrontView(pieces, model);
  const seatOf = new Map(seats.map((s) => [s.id, s]));
  const drawable = projection.gems.filter((g) => g.at && g.at.facing === "front" && seatOf.get(g.id)?.tag);
  const withGems = new Set(drawable.map((g) => g.toothId));
  const available = new Set(projection.teeth.map((t) => t.fdi));
  const toothBy = new Map(projection.teeth.map((t) => [t.fdi, t]));

  const layout = (order: readonly string[]) => {
    let cursor = 0;
    const slots: Slot[] = shownTeeth(order, withGems, available).map((fdi) => {
      const tooth = toothBy.get(fdi)!;
      const width = (tooth.x1 - tooth.x0) * PX;
      const slot = { tooth, left: cursor, width, height: Math.abs(tooth.incisal - tooth.cervical) * PX, gems: drawable.filter((g) => g.toothId === fdi) };
      cursor += width + GAP;
      return slot;
    });
    // The midline: between the two central incisors.
    const right = slots.find((s) => s.tooth.fdi[1] === "1" && (s.tooth.fdi[0] === "1" || s.tooth.fdi[0] === "4"));
    const midline = right ? right.left + right.width + GAP / 2 : cursor / 2;
    return { slots, midline, span: cursor - GAP };
  };
  const upper = layout(UPPER_TEETH);
  const lower = layout(LOWER_TEETH);

  // Both arches share the midline.
  const midX = MARGIN_LEFT + Math.max(upper.midline, lower.midline);
  const shift = (arch: typeof upper) => midX - arch.midline;
  for (const arch of [upper, lower]) for (const s of arch.slots) s.left += shift(arch);
  const contentRight = Math.max(...[upper, lower].map((a) => shift(a) + a.span));
  const width = Math.ceil(Math.max(contentRight + MARGIN, 2 * midX - MARGIN_LEFT + MARGIN + 60));

  const upperHeight = Math.max(...upper.slots.map((s) => s.height));
  const lowerHeight = Math.max(...lower.slots.map((s) => s.height));
  const upperNumbers = MARGIN + HEADING;
  const upperTags = upperNumbers + NUMBER_ROW;
  const upperGum = upperTags + TAG_ROW;
  const upperNeck = upperGum + GUM;
  const between = upperNeck + upperHeight;
  const lowerNeck = between + BETWEEN + lowerHeight;
  const lowerTags = lowerNeck + GUM;
  const lowerNumbers = lowerTags + TAG_ROW;
  const height = Math.ceil(lowerNumbers + NUMBER_ROW + MARGIN);

  const parts: string[] = [];
  const text = (x: number, y: number, body: string, size: number, opts: { weight?: number; fill?: string; anchor?: string } = {}) =>
    `<text x="${round(x)}" y="${round(y)}" font-family="${FONT}" font-size="${size}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? INK}" text-anchor="${opts.anchor ?? "start"}" dominant-baseline="central">${body}</text>`;

  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(text(MARGIN, MARGIN + 18, "FLAT DESIGN MAP — the teeth seen from the front, facing the person, like the photo", 26, { weight: 700 }));
  parts.push(text(MARGIN, MARGIN + 56, "Left of this image = the person's RIGHT side · Right of this image = the person's LEFT side", 21, { fill: "#3b4652" }));

  const tags: { upper: Tag[]; lower: Tag[] } = { upper: [], lower: [] };
  const gemsSvg: string[] = [];

  const drawArch = (arch: typeof upper, isLower: boolean) => {
    const neck = isLower ? lowerNeck : upperNeck;
    const numberY = (isLower ? lowerNumbers : upperNumbers) + NUMBER_ROW / 2;
    const first = arch.slots[0];
    const last = arch.slots[arch.slots.length - 1];
    // Gum band along the necks.
    const gumTop = isLower ? neck : neck - GUM;
    parts.push(`<rect x="${round(first.left - GAP / 2)}" y="${round(gumTop)}" width="${round(last.left + last.width - first.left + GAP)}" height="${GUM}" fill="${GUM_FILL}"/>`);
    parts.push(text(MARGIN, numberY, isLower ? "LOWER ARCH" : "UPPER ARCH", 22, { weight: 700, fill: "#3b4652" }));

    for (const slot of arch.slots) {
      const { tooth } = slot;
      // Tooth millimetres → this slot's pixels, the neck on the arch's gum line.
      const dx = slot.left - tooth.x0 * PX;
      const dy = neck - tooth.cervical * PX;
      const toPx = (x: number, y: number): [number, number] => [x * PX + dx, y * PX + dy];
      const crown = crownOutline(tooth).map((cmd): FrontViewPathCommand => {
        if (cmd[0] === "Z") return cmd;
        if (cmd[0] === "C") return ["C", ...toPx(cmd[1], cmd[2]), ...toPx(cmd[3], cmd[4]), ...toPx(cmd[5], cmd[6])];
        return [cmd[0], ...toPx(cmd[1], cmd[2])];
      });
      const bare = slot.gems.length === 0;
      parts.push(
        `<path d="${pathToSvg(crown)}" fill="${bare ? BARE_FILL : ENAMEL}" stroke="${bare ? "#a3a8ae" : INK}" stroke-width="${bare ? 2 : 3}" stroke-linejoin="round"/>`,
      );
      const centre = slot.left + slot.width / 2;
      parts.push(text(centre, numberY, tooth.fdi, 34, { weight: 700, fill: bare ? MUTED : INK, anchor: "middle" }));
      if (bare && slot.width >= 50) {
        const mid = neck + ((isLower ? -1 : 1) * slot.height) / 2;
        parts.push(text(centre, mid - 10, "no", 16, { fill: MUTED, anchor: "middle" }));
        parts.push(text(centre, mid + 10, "gem", 16, { fill: MUTED, anchor: "middle" }));
      }

      for (const g of slot.gems) {
        const at = g.at!;
        const [x, y] = toPx(at.x, at.y);
        const r = at.r * PX;
        const { outline, hollow } = silhouette(g.shape);
        const d = pathToSvg(place(outline, { x, y, r, rotation: at.rotation, stretch: at.stretch }));
        const color = g.piece.look.color;
        const svg = hollow
          ? `<path d="${d}" fill="none" stroke="${GEM_EDGE}" stroke-width="${round(Math.max(2, r * 0.3) + 2)}" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${round(Math.max(2, r * 0.3))}" stroke-linejoin="round"/>`
          : `<path d="${d}" fill="${color}" stroke="${GEM_EDGE}" stroke-width="2" stroke-linejoin="round"/>`;
        const drawn = { tag: seatOf.get(g.id)!.tag!, x, y, r, svg };
        gemsSvg.push(svg);
        (isLower ? tags.lower : tags.upper).push({ tag: drawn.tag, want: x, x, gem: drawn });
      }
    }
  };
  // The midline, drawn under the crowns: seen in the gap between the central incisors.
  parts.push(
    `<line x1="${round(midX)}" y1="${upperGum - 6}" x2="${round(midX)}" y2="${lowerTags + 6}" stroke="${MIDLINE}" stroke-width="3" stroke-dasharray="12 8"/>`,
  );
  drawArch(upper, false);
  drawArch(lower, true);

  const gapY = between + BETWEEN / 2;
  parts.push(`<rect x="${round(midX - 66)}" y="${round(gapY - 17)}" width="132" height="34" rx="6" fill="#ffffff"/>`);
  parts.push(text(midX, gapY, "MIDLINE", 22, { weight: 700, fill: MIDLINE, anchor: "middle" }));
  parts.push(text(MARGIN, gapY, "◀ PERSON'S RIGHT", 21, { weight: 700, fill: "#3b4652" }));
  parts.push(text(width - MARGIN, gapY, "PERSON'S LEFT ▶", 21, { weight: 700, fill: "#3b4652", anchor: "end" }));

  // Leader lines under the gems, from each tag to its gem; the gem's edge is marked on top.
  const leaders: string[] = [];
  const pills: string[] = [];
  const ends: string[] = [];
  for (const [row, isLower] of [
    [tags.upper, false],
    [tags.lower, true],
  ] as const) {
    spread(row);
    const top = isLower ? lowerTags + (TAG_ROW - TAG_H) / 2 : upperTags + (TAG_ROW - TAG_H) / 2;
    for (const t of row) {
      const anchorY = isLower ? top : top + TAG_H;
      const dx = t.x - t.gem.x;
      const dy = anchorY - t.gem.y;
      const len = Math.hypot(dx, dy) || 1;
      const edge = Math.min(t.gem.r * 0.85, len);
      const ex = t.gem.x + (dx / len) * edge;
      const ey = t.gem.y + (dy / len) * edge;
      leaders.push(`<line x1="${round(t.x)}" y1="${round(anchorY)}" x2="${round(ex)}" y2="${round(ey)}" stroke="${INK}" stroke-width="2"/>`);
      ends.push(`<circle cx="${round(ex)}" cy="${round(ey)}" r="3.5" fill="${INK}"/>`);
      pills.push(
        `<rect x="${round(t.x - TAG_W / 2)}" y="${round(top)}" width="${TAG_W}" height="${TAG_H}" rx="8" fill="#ffffff" stroke="${INK}" stroke-width="2"/>`,
        text(t.x, top + TAG_H / 2, t.tag, 22, { weight: 700, anchor: "middle" }),
      );
    }
  }
  parts.push(...leaders, ...gemsSvg, ...ends, ...pills);

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join("")}</svg>`,
    width,
    height,
  };
}
