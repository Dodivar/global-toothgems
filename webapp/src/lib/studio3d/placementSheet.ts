import { A4, writePdf, type PdfOp, type PdfPathCommand } from "../documents/pdfWriter";
import { DOC_INK } from "../documents/template";
import { textWidth, type FontWeight } from "../documents/text";
import { circleOutline, crownOutline, gemOutline, type FrontViewPathCommand, type FrontViewProjection } from "./frontView";

/**
 * The placement sheet ("fiche de pose"): an A4 PDF an artist prints and keeps
 * at the chair — the design's name and date, the front view with every gem
 * numbered, one row per gem (tooth, shape, size, colour, suggested order),
 * and what to have at hand per gem reference.
 *
 * Written with the documents' own PDF writer (`lib/documents/pdfWriter.ts`):
 * vector drawing, text in the standard fonts, no dependency. Every label and
 * cell arrives ready-made in the customer's language, so this module knows
 * nothing of i18n. Pure: unit-tested in `placementSheet.test.ts`.
 */

export interface PlacementSheetRow {
  number: number;
  order: number;
  tooth: string;
  shape: string;
  size: string;
  colour: string;
  /** Said after the tooth, e.g. "back face" or "not drawn". */
  note?: string;
}

export interface PlacementSheetTotal {
  reference: string;
  colour: string;
  size: string;
  count: number;
  /** The gem numbers of that reference, "1, 4, 7". */
  numbers: string;
  /** What to buy from the shop, "1 × pack of 20", or "—". */
  toBuy: string;
}

export interface PlacementSheetInput {
  projection: FrontViewProjection;
  name: string;
  /** Formatted date of the design (or of the sheet). */
  date: string;
  lang: string;
  rows: PlacementSheetRow[];
  totals: PlacementSheetTotal[];
  labels: {
    title: string;
    /** Under the name: "12 gems · 18 October 2026". */
    subtitle: string;
    figure: string;
    patientRight: string;
    patientLeft: string;
    unplacedNote: string | null;
    gemsTitle: string;
    number: string;
    tooth: string;
    shape: string;
    size: string;
    colour: string;
    order: string;
    totalsTitle: string;
    reference: string;
    count: string;
    numbers: string;
    toBuy: string;
    footer: string;
    page: (page: number, count: number) => string;
    author: string;
  };
}

const M = { x: 40, top: 40, bottom: 44 };
const WIDTH = A4.width - M.x * 2;
const LOGO = { w: 110, ratio: 1019 / 281 };
const ENAMEL = "#fbf8f1";
const ENAMEL_EDGE = "#b9ab95";
const GUM = "#f3d3d5";
const STAGE = "#f4f8fc";
const GEM_EDGE = "#263c52";
const ROW = 15;
const BODY = 8.2;
const HEAD = 6.8;

const text = (ops: PdfOp[], x: number, y: number, value: string, weight: FontWeight, size: number, color: string, align: "start" | "end" | "middle" = "start") => {
  if (!value) return;
  const w = textWidth(value, weight, size);
  ops.push({ kind: "text", x: align === "end" ? x - w : align === "middle" ? x - w / 2 : x, y, text: value, weight, size, color });
};

/** `value` shortened with an ellipsis to fit `max` points. */
export function fitText(value: string, weight: FontWeight, size: number, max: number): string {
  if (textWidth(value, weight, size) <= max) return value;
  let out = value;
  while (out.length > 1 && textWidth(`${out}…`, weight, size) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
}

/** A hex colour the PDF accepts, else white. */
const hex = (value: string) => (/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff");

/** Drawing commands from millimetres of the front view to points of the page. */
function toPage(commands: FrontViewPathCommand[], map: (x: number, y: number) => [number, number]): PdfPathCommand[] {
  return commands.map((c): PdfPathCommand => {
    if (c[0] === "Z") return c;
    if (c[0] === "C") return ["C", ...map(c[1], c[2]), ...map(c[3], c[4]), ...map(c[5], c[6])];
    return [c[0], ...map(c[1], c[2])];
  });
}

/** The front view at `top`, full width; returns its height in points. */
function drawFigure(ops: PdfOp[], input: PlacementSheetInput, top: number): number {
  const { projection } = input;
  const { box } = projection;
  const height = WIDTH / projection.aspect;
  const k = WIDTH / box.width;
  const map = (x: number, y: number): [number, number] => [M.x + (x - box.x) * k, top + (y - box.y) * k];
  ops.push({ kind: "rect", x: M.x, y: top, w: WIDTH, h: height, fill: STAGE });
  // Gums: a band behind each arch's necks.
  const upper = projection.teeth.filter((t) => !t.lower);
  const lower = projection.teeth.filter((t) => t.lower);
  const band = (teeth: typeof upper, up: boolean) => {
    const xs = teeth.flatMap((t) => [t.x0, t.x1]);
    const neck = up ? Math.max(...teeth.map((t) => t.cervical)) : Math.min(...teeth.map((t) => t.cervical));
    const [x0, y0] = map(Math.min(...xs) - 0.6, up ? box.y : neck - 2.4);
    const [x1, y1] = map(Math.max(...xs) + 0.6, up ? neck + 2.4 : box.y + box.height);
    ops.push({ kind: "rect", x: x0, y: y0, w: x1 - x0, h: y1 - y0, fill: GUM });
  };
  band(upper, true);
  band(lower, false);
  for (const t of projection.teeth) {
    ops.push({ kind: "path", commands: toPage(crownOutline(t), map), fill: ENAMEL, stroke: ENAMEL_EDGE, width: 0.45 });
  }
  // Which side is which: an artist faces the patient.
  text(ops, M.x + 6, top + 11, input.labels.patientRight, "bold", 6.4, DOC_INK.muted);
  text(ops, M.x + WIDTH - 6, top + 11, input.labels.patientLeft, "bold", 6.4, DOC_INK.muted, "end");

  const drawn = projection.gems.filter((g) => g.at);
  for (const g of drawn) {
    const at = g.at!;
    ops.push({
      kind: "path",
      commands: toPage(gemOutline(g.shape, at), map),
      fill: hex(g.piece.look.color),
      stroke: GEM_EDGE,
      width: 0.5,
      ...(at.facing === "back" ? { dash: [1.4, 1] } : {}),
    });
  }
  // Numbers last, above every gem.
  for (const g of drawn) {
    const at = g.at!;
    const badge = 4.6;
    const [gx, gy] = map(at.x, at.y);
    const reach = at.r * k * 0.75 + badge * 0.75;
    const cx = gx + reach;
    const cy = gy - reach;
    ops.push({ kind: "path", commands: circleOutline(cx, cy, badge), fill: "#ffffff", stroke: DOC_INK.ink, width: 0.5 });
    const label = String(g.number);
    text(ops, cx, cy + 2.1, label, "bold", label.length > 2 ? 4.6 : 5.8, DOC_INK.ink, "middle");
  }
  ops.push({ kind: "line", x1: M.x, y1: top + height, x2: M.x + WIDTH, y2: top + height, color: DOC_INK.hairline, width: 0.6 });
  return height;
}

/** The tooth, shortened if need be so that its note ("back face") is always printed whole. */
export function toothCell(row: Pick<PlacementSheetRow, "tooth" | "note">, width: number): string {
  if (!row.note) return row.tooth;
  const note = ` (${row.note})`;
  return `${fitText(row.tooth, "regular", BODY, Math.max(width - textWidth(note, "regular", BODY), 12))}${note}`;
}

interface Column {
  label: string;
  width: number;
  align?: "start" | "end";
}

/**
 * Build the sheet. Long designs flow over several pages; the table header is
 * repeated on each, and every page carries the footer and its number.
 */
export function buildPlacementSheet(input: PlacementSheetInput, createdAt: Date = new Date()): Uint8Array {
  const { labels } = input;
  const pages: PdfOp[][] = [];
  let ops: PdfOp[] = [];
  let y = 0;
  const limit = A4.height - M.bottom - 26;

  const header = (first: boolean) => {
    ops = [];
    pages.push(ops);
    const logoW = first ? LOGO.w : LOGO.w * 0.72;
    ops.push({ kind: "logo", x: M.x, y: M.top, w: logoW, h: logoW / LOGO.ratio });
    text(ops, A4.width - M.x, M.top + 10, labels.title.toUpperCase(), "bold", 10, DOC_INK.ink, "end");
    text(ops, A4.width - M.x, M.top + 24, input.date, "regular", 8.5, DOC_INK.muted, "end");
    y = M.top + Math.max(logoW / LOGO.ratio, 28) + 12;
    ops.push({ kind: "rect", x: M.x, y, w: 36, h: 2, fill: DOC_INK.accent });
    ops.push({ kind: "line", x1: M.x + 36, y1: y + 1, x2: A4.width - M.x, y2: y + 1, color: DOC_INK.hairline, width: 0.6 });
    y += 18;
  };

  const table = (title: string, columns: Column[], rows: string[][]) => {
    const head = () => {
      text(ops, M.x, y + 8, title.toUpperCase(), "bold", 7.4, DOC_INK.accent);
      y += 14;
      ops.push({ kind: "rect", x: M.x, y, w: WIDTH, h: ROW, fill: DOC_INK.band });
      let x = M.x;
      for (const c of columns) {
        const label = fitText(c.label.toUpperCase(), "bold", HEAD, c.width - 6);
        if (c.align === "end") text(ops, x + c.width - 4, y + 10, label, "bold", HEAD, DOC_INK.muted, "end");
        else text(ops, x + 4, y + 10, label, "bold", HEAD, DOC_INK.muted);
        x += c.width;
      }
      y += ROW;
    };
    if (y + 14 + ROW * 2 > limit) header(false);
    head();
    for (const row of rows) {
      if (y + ROW > limit) {
        header(false);
        head();
      }
      let x = M.x;
      row.forEach((cell, i) => {
        const c = columns[i];
        const weight: FontWeight = i === 0 ? "bold" : "regular";
        const value = fitText(cell, weight, BODY, c.width - 8);
        if (c.align === "end") text(ops, x + c.width - 4, y + 10.5, value, weight, BODY, DOC_INK.ink, "end");
        else text(ops, x + 4, y + 10.5, value, weight, BODY, i === 0 ? DOC_INK.ink : DOC_INK.body);
        x += c.width;
      });
      y += ROW;
      ops.push({ kind: "line", x1: M.x, y1: y, x2: M.x + WIDTH, y2: y, color: DOC_INK.hairline, width: 0.5 });
    }
    y += 18;
  };

  header(true);
  // Name and summary.
  text(ops, M.x, y + 12, fitText(input.name, "bold", 15, WIDTH), "bold", 15, DOC_INK.ink);
  text(ops, M.x, y + 27, labels.subtitle, "regular", 8.5, DOC_INK.muted);
  y += 40;

  // The front view.
  text(ops, M.x, y + 8, labels.figure.toUpperCase(), "bold", 7.4, DOC_INK.accent);
  y += 14;
  y += drawFigure(ops, input, y) + 8;
  if (labels.unplacedNote) {
    text(ops, M.x, y + 8, fitText(labels.unplacedNote, "regular", 7.4, WIDTH), "regular", 7.4, DOC_INK.muted);
    y += 12;
  }
  y += 12;

  const gemColumns: Column[] = [
    { label: labels.number, width: 26 },
    { label: labels.tooth, width: 168 },
    { label: labels.shape, width: 72 },
    { label: labels.size, width: 72 },
    { label: labels.colour, width: 135 },
    { label: labels.order, width: WIDTH - 26 - 168 - 72 - 72 - 135, align: "end" },
  ];
  table(
    labels.gemsTitle,
    gemColumns,
    input.rows.map((r) => [String(r.number), toothCell(r, gemColumns[1].width - 8), r.shape, r.size, r.colour, String(r.order)]),
  );

  const totalColumns: Column[] = [
    { label: labels.reference, width: 150 },
    { label: labels.colour, width: 95 },
    { label: labels.size, width: 62 },
    { label: labels.count, width: 40, align: "end" },
    { label: labels.numbers, width: 86 },
    { label: labels.toBuy, width: WIDTH - 150 - 95 - 62 - 40 - 86 },
  ];
  table(
    labels.totalsTitle,
    totalColumns,
    input.totals.map((r) => [r.reference, r.colour, r.size, String(r.count), r.numbers, r.toBuy]),
  );

  // Footer on every page, once the page count is known.
  pages.forEach((page, i) => {
    const top = A4.height - M.bottom;
    page.push({ kind: "line", x1: M.x, y1: top - 10, x2: A4.width - M.x, y2: top - 10, color: DOC_INK.hairline, width: 0.6 });
    text(page, M.x, top, fitText(labels.footer, "regular", 6.8, WIDTH - 70), "regular", 6.8, DOC_INK.muted);
    text(page, A4.width - M.x, top, labels.page(i + 1, pages.length), "regular", 6.8, DOC_INK.muted, "end");
  });

  return writePdf(pages, { title: `${labels.title} · ${input.name}`, author: labels.author, lang: input.lang, createdAt });
}

/** "fiche-de-pose-my-design-2026-10-18.pdf": the file name, ASCII only. */
export function placementSheetFileName(prefix: string, name: string, date: Date = new Date()): string {
  const slug = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
  return `${[slug(prefix), slug(name)].filter(Boolean).join("-")}-${date.toISOString().slice(0, 10)}.pdf`;
}

/** One gem reference of the design — a product in one colour and one size — with the numbers of its gems. */
export interface ReferenceGroup {
  productId: string;
  variantId: string | null;
  ss: number;
  numbers: number[];
}

/** The design's gems grouped per reference, in the order their first gem is numbered. */
export function referenceGroups(projection: FrontViewProjection): ReferenceGroup[] {
  const groups = new Map<string, ReferenceGroup>();
  for (const g of projection.gems) {
    const variantId = g.piece.variantId ?? null;
    const key = `${g.piece.productId}|${variantId ?? ""}|${g.piece.ss}`;
    const group = groups.get(key) ?? { productId: g.piece.productId, variantId, ss: g.piece.ss, numbers: [] };
    group.numbers.push(g.number);
    groups.set(key, group);
  }
  return [...groups.values()];
}
