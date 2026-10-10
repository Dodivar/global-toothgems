import { WORDMARK } from "./assets.generated.ts";
import { encodeWinAnsi, type FontWeight } from "./text.ts";

/**
 * A multi-page PDF written by hand from drawing operations — text, rules,
 * filled boxes and the wordmark. Text stays text (selectable, searchable,
 * sharp at any zoom) in the PDF standard fonts, so nothing is embedded but
 * the logo. Like the certificate's writer (`lib/certificate/pdf.ts`), the
 * structure is small enough not to justify a dependency (AGENTS.md §12).
 *
 * Coordinates are points from the top-left corner of the page; the writer
 * flips them into PDF space. Pure: no DOM, no canvas — runs in the browser,
 * on the server or in an Edge Function. Unit-tested in `documents.test.ts`.
 */

/** A4 portrait in PDF points (1/72 in). */
export const A4 = { width: 595.28, height: 841.89 } as const;

export type PdfOp =
  | { kind: "text"; x: number; y: number; text: string; weight: FontWeight; size: number; color: string }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { kind: "logo"; x: number; y: number; w: number; h: number };

export interface PdfInfo {
  title: string;
  author: string;
  subject?: string;
  /** BCP 47 language of the content ("fr", "en"). */
  lang: string;
  /** When the file was produced; written as the creation date. */
  createdAt: Date;
}

const encoder = new TextEncoder();
const num = (value: number) => String(Math.round(value * 100) / 100);

/** "#rrggbb" as PDF colour components. */
function rgb(hex: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`invalid colour ${hex}`);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((c) => num(c / 255)).join(" ");
}

/** A PDF literal string in the fonts' encoding, with non-ASCII bytes escaped. */
function literal(text: string): string {
  let out = "(";
  for (const byte of encodeWinAnsi(text)) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += `\\${String.fromCharCode(byte)}`;
    else if (byte < 0x20 || byte > 0x7e) out += `\\${byte.toString(8).padStart(3, "0")}`;
    else out += String.fromCharCode(byte);
  }
  return `${out})`;
}

/** A PDF text string in UTF-16BE (hex), for metadata. */
function unicode(value: string): string {
  let hex = "FEFF";
  for (let i = 0; i < value.length; i++) hex += value.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

function pdfDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `(D:${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z)`;
}

function base64Bytes(data: string): Uint8Array {
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** The page's drawing operations as a content stream (ASCII only). */
export function contentStream(ops: PdfOp[], pageHeight: number = A4.height): string {
  const out: string[] = [];
  for (const op of ops) {
    if (op.kind === "rect") {
      out.push(`${rgb(op.fill)} rg ${num(op.x)} ${num(pageHeight - op.y - op.h)} ${num(op.w)} ${num(op.h)} re f`);
    } else if (op.kind === "line") {
      out.push(
        `${rgb(op.color)} RG ${num(op.width)} w ${num(op.x1)} ${num(pageHeight - op.y1)} m ${num(op.x2)} ${num(pageHeight - op.y2)} l S`,
      );
    } else if (op.kind === "logo") {
      out.push(`q ${num(op.w)} 0 0 ${num(op.h)} ${num(op.x)} ${num(pageHeight - op.y - op.h)} cm /Logo Do Q`);
    } else {
      const font = op.weight === "bold" ? "/F2" : "/F1";
      out.push(`BT ${rgb(op.color)} rg ${font} ${num(op.size)} Tf ${num(op.x)} ${num(pageHeight - op.y)} Td ${literal(op.text)} Tj ET`);
    }
  }
  return out.join("\n");
}

export function writePdf(pages: PdfOp[][], info: PdfInfo): Uint8Array {
  if (pages.length === 0) throw new Error("a document needs a page");
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  /** Objects are numbered in the order they are written, from 1. */
  const object = (id: number, body: () => void) => {
    if (id !== offsets.length + 1) throw new Error("objects out of order");
    offsets.push(length);
    push(`${id} 0 obj\n`);
    body();
    push("\nendobj\n");
  };

  // Fixed objects: 1 catalog, 2 page tree, 3–4 fonts, 5 logo, 6 logo mask, 7 info; then page + content pairs.
  const INFO = 7;
  const pageId = (index: number) => 8 + index * 2;
  const ink = base64Bytes(WORDMARK.ink);
  const mask = base64Bytes(WORDMARK.mask);

  // The binary comment tells transfer tools the file is not plain text.
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(1, () => push(`<< /Type /Catalog /Pages 2 0 R /Lang ${unicode(info.lang)} >>`));
  object(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`));
  object(3, () => push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  object(4, () => push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  // The wordmark: a plain ink image whose shape is given by its soft mask.
  const image = (data: Uint8Array, extra: string) =>
    `<< /Type /XObject /Subtype /Image /Width ${WORDMARK.width} /Height ${WORDMARK.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length}${extra} >>\nstream\n`;
  object(5, () => {
    push(image(ink, " /SMask 6 0 R"));
    push(ink);
    push("\nendstream");
  });
  object(6, () => {
    push(image(mask, ""));
    push(mask);
    push("\nendstream");
  });
  object(INFO, () => {
    const subject = info.subject ? ` /Subject ${unicode(info.subject)}` : "";
    push(
      `<< /Title ${unicode(info.title)} /Author ${unicode(info.author)}${subject} /Producer (Global Toothgems) /CreationDate ${pdfDate(info.createdAt)} >>`,
    );
  });
  pages.forEach((ops, index) => {
    object(pageId(index), () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Logo 5 0 R >> >> /Contents ${pageId(index) + 1} 0 R >>`,
      ),
    );
    const content = contentStream(ops);
    object(pageId(index) + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  });

  const xref = length;
  push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R /Info ${INFO} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
