import { A4, writePdf, type PdfOp } from "./pdfWriter";
import { textWidth, wrapText, type FontWeight } from "./text";

/**
 * The Global Toothgems document template: every PDF the site hands out — the
 * order form today, the Studio 3D quote and the other downloads tomorrow —
 * is a `BusinessDocument` laid out here, so they share one look: the
 * wordmark and the document's title and references at the top, the parties,
 * then blocks (headings, tables, totals, paragraphs) flowing over as many A4
 * pages as they need, a table's header repeated on each page it continues on,
 * and the store's legal mentions with the page number at the bottom.
 *
 * The model carries text only, already translated and formatted (money,
 * dates): the template never decides what a document says, only where it
 * goes. A builder per document (`orderDocument.ts`, …) fills the model from
 * real data. Pure: unit-tested in `documents.test.ts`.
 */

export interface DocumentParty {
  /** "Seller", "Billing address"… */
  title: string;
  /** First line printed in bold (a name). */
  lines: string[];
}

export interface DocumentColumn {
  label: string;
  /** Share of the table's width; the shares are normalised. */
  width: number;
  align?: "start" | "end";
}

export interface DocumentTableRow {
  cells: string[];
  /** A second, smaller line under the first cell (variant, options, a note). */
  detail?: string;
}

export interface DocumentTotalRow {
  label: string;
  value: string;
  emphasis?: "strong" | "muted";
}

export type DocumentBlock =
  | { kind: "heading"; text: string }
  | { kind: "table"; columns: DocumentColumn[]; rows: DocumentTableRow[] }
  | { kind: "totals"; rows: DocumentTotalRow[] }
  | { kind: "paragraph"; text: string; tone?: "body" | "muted" | "notice" };

export interface BusinessDocument {
  /** BCP 47 language of the text ("fr", "en"). */
  lang: string;
  /** The kind of document, printed large: "Bon de commande", "Devis"… */
  title: string;
  /** References printed under the title: number, dates, validity… */
  meta: { label: string; value: string }[];
  /** Up to three blocks of addresses side by side. */
  parties: DocumentParty[];
  blocks: DocumentBlock[];
  /** The store's legal mentions, printed small at the foot of every page. */
  footer: string[];
  /** "Page 1 of 2", in the document's language. */
  pageLabel: (page: number, count: number) => string;
  /** File metadata: title shown by readers, author (the store). */
  info: { title: string; author: string; subject?: string };
}

export const DOC_INK = {
  ink: "#111111",
  body: "#444444",
  muted: "#5c5c5c",
  rule: "#c9c9c7",
  hairline: "#e4e3df",
  band: "#f2f1ee",
  accent: "#5a7796",
  noticeBand: "#eef3f9",
} as const;

const MARGIN = { x: 48, top: 44, bottom: 40 } as const;
const CONTENT_WIDTH = A4.width - MARGIN.x * 2;
const LOGO = { w: 132, ratio: 1019 / 281 } as const;
const FOOTER_SIZE = 6.8;
const FOOTER_LEADING = 9;
const BODY = 9;
const SMALL = 7.6;
const GAP = 18;

interface Cursor {
  pages: PdfOp[][];
  ops: PdfOp[];
  y: number;
  /** Lowest y content may reach on this page (above the footer). */
  limit: number;
}

function text(ops: PdfOp[], x: number, y: number, value: string, weight: FontWeight, size: number, color: string, align: "start" | "end" = "start") {
  if (!value) return;
  const left = align === "end" ? x - textWidth(value, weight, size) : x;
  ops.push({ kind: "text", x: left, y, text: value, weight, size, color });
}

/** Height of the footer block, so the content stops above it. */
function footerHeight(doc: BusinessDocument): number {
  const lines = doc.footer.flatMap((line) => wrapText(line, "regular", FOOTER_SIZE, CONTENT_WIDTH - 60));
  return Math.max(1, lines.length) * FOOTER_LEADING + 14;
}

/** The header every page starts with; returns the y where content starts. */
function drawHeader(ops: PdfOp[], doc: BusinessDocument, first: boolean): number {
  const top = MARGIN.top;
  const logoW = first ? LOGO.w : LOGO.w * 0.72;
  const logoH = logoW / LOGO.ratio;
  ops.push({ kind: "logo", x: MARGIN.x, y: top, w: logoW, h: logoH });

  const right = A4.width - MARGIN.x;
  const titleSize = first ? 17 : 11;
  let y = top + titleSize * 0.8;
  text(ops, right, y, doc.title.toUpperCase(), "bold", titleSize, DOC_INK.ink, "end");
  const metaRows = first ? doc.meta : doc.meta.slice(0, 1);
  y += first ? 16 : 13;
  for (const row of metaRows) {
    const value = row.value;
    const valueWidth = textWidth(value, "bold", BODY);
    text(ops, right, y, value, "bold", BODY, DOC_INK.ink, "end");
    text(ops, right - valueWidth - 6, y, row.label, "regular", BODY, DOC_INK.muted, "end");
    y += 12.5;
  }
  const bottom = Math.max(top + logoH, y - 6) + 12;
  ops.push({ kind: "rect", x: MARGIN.x, y: bottom, w: 36, h: 2, fill: DOC_INK.accent });
  ops.push({ kind: "line", x1: MARGIN.x + 36, y1: bottom + 1, x2: right, y2: bottom + 1, color: DOC_INK.hairline, width: 0.6 });
  return bottom + 2 + GAP;
}

function drawFooter(ops: PdfOp[], doc: BusinessDocument, page: number, count: number) {
  const lines = doc.footer.flatMap((line) => wrapText(line, "regular", FOOTER_SIZE, CONTENT_WIDTH - 60));
  const height = Math.max(1, lines.length) * FOOTER_LEADING;
  const top = A4.height - MARGIN.bottom - height;
  ops.push({ kind: "line", x1: MARGIN.x, y1: top - 4, x2: A4.width - MARGIN.x, y2: top - 4, color: DOC_INK.hairline, width: 0.6 });
  lines.forEach((line, i) => text(ops, MARGIN.x, top + 6 + i * FOOTER_LEADING, line, "regular", FOOTER_SIZE, DOC_INK.muted));
  text(ops, A4.width - MARGIN.x, top + 6, doc.pageLabel(page, count), "regular", FOOTER_SIZE, DOC_INK.muted, "end");
}

function newPage(cursor: Cursor, doc: BusinessDocument) {
  cursor.ops = [];
  cursor.pages.push(cursor.ops);
  cursor.y = drawHeader(cursor.ops, doc, cursor.pages.length === 1);
}

/** Starts a new page when `height` does not fit; returns whether it did. */
function ensure(cursor: Cursor, doc: BusinessDocument, height: number): boolean {
  if (cursor.y + height <= cursor.limit) return false;
  newPage(cursor, doc);
  return true;
}

function drawParties(cursor: Cursor, doc: BusinessDocument) {
  const parties = doc.parties.filter((p) => p.lines.some(Boolean)).slice(0, 3);
  if (parties.length === 0) return;
  const gutter = 20;
  const width = (CONTENT_WIDTH - gutter * (parties.length - 1)) / parties.length;
  const columns = parties.map((party) =>
    party.lines.filter(Boolean).flatMap((line, i) => wrapText(line, i === 0 ? "bold" : "regular", BODY, width).map((l) => ({ text: l, bold: i === 0 }))),
  );
  const height = 14 + Math.max(...columns.map((c) => c.length)) * 12;
  ensure(cursor, doc, height);
  parties.forEach((party, i) => {
    const x = MARGIN.x + i * (width + gutter);
    text(cursor.ops, x, cursor.y + 7, party.title.toUpperCase(), "bold", SMALL - 0.6, DOC_INK.accent);
    columns[i].forEach((line, j) =>
      text(cursor.ops, x, cursor.y + 21 + j * 12, line.text, line.bold ? "bold" : "regular", BODY, line.bold ? DOC_INK.ink : DOC_INK.body),
    );
  });
  cursor.y += height + GAP;
}

function drawHeading(cursor: Cursor, doc: BusinessDocument, value: string) {
  // Kept with at least the start of what follows.
  ensure(cursor, doc, 52);
  text(cursor.ops, MARGIN.x, cursor.y + 10, value, "bold", 11, DOC_INK.ink);
  cursor.y += 20;
}

function drawTable(cursor: Cursor, doc: BusinessDocument, block: Extract<DocumentBlock, { kind: "table" }>) {
  const share = block.columns.reduce((sum, c) => sum + c.width, 0);
  const widths = block.columns.map((c) => (c.width / share) * CONTENT_WIDTH);
  const lefts = widths.map((_, i) => MARGIN.x + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const pad = 6;
  const headHeight = 20;

  const drawHead = () => {
    cursor.ops.push({ kind: "rect", x: MARGIN.x, y: cursor.y, w: CONTENT_WIDTH, h: headHeight, fill: DOC_INK.band });
    block.columns.forEach((column, i) => {
      const end = column.align === "end";
      text(cursor.ops, end ? lefts[i] + widths[i] - pad : lefts[i] + pad, cursor.y + 13, column.label.toUpperCase(), "bold", SMALL - 0.6, DOC_INK.muted, end ? "end" : "start");
    });
    cursor.y += headHeight;
  };

  ensure(cursor, doc, headHeight + 30);
  drawHead();
  for (const row of block.rows) {
    const cells = row.cells.map((cell, i) => wrapText(cell, i === 0 ? "bold" : "regular", BODY, widths[i] - pad * 2));
    const detail = row.detail ? wrapText(row.detail, "regular", SMALL, widths[0] - pad * 2) : [];
    const content = Math.max(...cells.map((c) => c.length * 12), cells[0].length * 12 + detail.length * 10);
    const height = 10 + content;
    if (ensure(cursor, doc, height)) drawHead();
    cells.forEach((cellLines, i) => {
      const end = block.columns[i].align === "end";
      cellLines.forEach((line, j) =>
        text(cursor.ops, end ? lefts[i] + widths[i] - pad : lefts[i] + pad, cursor.y + 15 + j * 12, line, i === 0 ? "bold" : "regular", BODY, i === 0 ? DOC_INK.ink : DOC_INK.body, end ? "end" : "start"),
      );
    });
    detail.forEach((line, j) => text(cursor.ops, lefts[0] + pad, cursor.y + 15 + cells[0].length * 12 + j * 10, line, "regular", SMALL, DOC_INK.muted));
    cursor.y += height;
    cursor.ops.push({ kind: "line", x1: MARGIN.x, y1: cursor.y, x2: A4.width - MARGIN.x, y2: cursor.y, color: DOC_INK.hairline, width: 0.6 });
  }
  cursor.y += GAP;
}

function drawTotals(cursor: Cursor, doc: BusinessDocument, rows: DocumentTotalRow[]) {
  const width = Math.min(250, CONTENT_WIDTH);
  const left = A4.width - MARGIN.x - width;
  const right = A4.width - MARGIN.x;
  // Totals are read together: never split over two pages.
  ensure(cursor, doc, rows.length * 16 + 12);
  for (const row of rows) {
    const strong = row.emphasis === "strong";
    if (strong) {
      cursor.y += 4;
      cursor.ops.push({ kind: "line", x1: left, y1: cursor.y, x2: right, y2: cursor.y, color: DOC_INK.rule, width: 0.8 });
      cursor.y += 4;
    }
    const size = strong ? BODY + 2 : BODY;
    const color = row.emphasis === "muted" ? DOC_INK.muted : strong ? DOC_INK.ink : DOC_INK.body;
    const weight = strong ? "bold" : "regular";
    const valueWidth = textWidth(row.value, weight, size);
    const label = wrapText(row.label, weight, size, width - valueWidth - 12);
    label.forEach((line, i) => text(cursor.ops, left, cursor.y + 11 + i * 12, line, weight, size, color));
    text(cursor.ops, right, cursor.y + 11, row.value, weight, size, color, "end");
    cursor.y += 4 + label.length * 12 + (strong ? 4 : 0);
  }
  cursor.y += GAP;
}

function drawParagraph(cursor: Cursor, doc: BusinessDocument, block: Extract<DocumentBlock, { kind: "paragraph" }>) {
  const notice = block.tone === "notice";
  const pad = notice ? 10 : 0;
  const size = block.tone === "muted" ? SMALL + 0.4 : BODY;
  const leading = size + 3.5;
  const lines = wrapText(block.text, "regular", size, CONTENT_WIDTH - pad * 2 - (notice ? 4 : 0));
  let index = 0;
  while (index < lines.length) {
    ensure(cursor, doc, leading + pad * 2);
    const room = Math.max(1, Math.floor((cursor.limit - cursor.y - pad * 2) / leading));
    const slice = lines.slice(index, index + room);
    const height = slice.length * leading + pad * 2;
    if (notice) {
      cursor.ops.push({ kind: "rect", x: MARGIN.x, y: cursor.y, w: CONTENT_WIDTH, h: height, fill: DOC_INK.noticeBand });
      cursor.ops.push({ kind: "rect", x: MARGIN.x, y: cursor.y, w: 2.5, h: height, fill: DOC_INK.accent });
    }
    const color = block.tone === "muted" ? DOC_INK.muted : notice ? DOC_INK.ink : DOC_INK.body;
    slice.forEach((line, i) => text(cursor.ops, MARGIN.x + pad + (notice ? 4 : 0), cursor.y + pad + size + i * leading, line, "regular", size, color));
    cursor.y += height;
    index += slice.length;
    if (index < lines.length) newPage(cursor, doc);
  }
  cursor.y += GAP * 0.75;
}

/** The document's pages as drawing operations. */
export function layoutDocument(doc: BusinessDocument): PdfOp[][] {
  const cursor: Cursor = { pages: [], ops: [], y: 0, limit: A4.height - MARGIN.bottom - footerHeight(doc) - 12 };
  newPage(cursor, doc);
  drawParties(cursor, doc);
  for (const block of doc.blocks) {
    if (block.kind === "heading") drawHeading(cursor, doc, block.text);
    else if (block.kind === "table") drawTable(cursor, doc, block);
    else if (block.kind === "totals") drawTotals(cursor, doc, block.rows);
    else drawParagraph(cursor, doc, block);
  }
  cursor.pages.forEach((ops, i) => drawFooter(ops, doc, i + 1, cursor.pages.length));
  return cursor.pages;
}

/** The document as PDF bytes. `createdAt` is written in the file's metadata. */
export function renderDocument(doc: BusinessDocument, createdAt: Date = new Date()): Uint8Array {
  return writePdf(layoutDocument(doc), { ...doc.info, lang: doc.lang, createdAt });
}
