// Generated from webapp/src/lib/documents/text.ts by webapp/scripts/sync-documents.mjs — edit the source, then run `npm run sync:documents`.
import { HELVETICA_BOLD_WIDTHS, HELVETICA_WIDTHS } from "./assets.generated.ts";

/**
 * Text in the PDF standard fonts: Helvetica and Helvetica-Bold, which every
 * PDF reader carries, so nothing is embedded and the files stay a few
 * kilobytes. Their WinAnsi encoding covers French and English (accents, €,
 * typographic quotes and dashes); anything else is replaced by a close
 * character, or "?" as a last resort. Pure.
 */

export type FontWeight = "regular" | "bold";

/** Unicode → WinAnsi for the 0x80–0x9F block (the rest of Latin-1 maps to itself). */
const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** Characters the encoding lacks, written with one it has. */
const FALLBACK: Record<number, number> = {
  0x2212: 0x2d, // minus sign → hyphen
  0x2010: 0x2d,
  0x2011: 0x2d,
  0x202f: 0xa0, // narrow no-break space (French number grouping) → no-break space
  0x2009: 0x20,
  0x200b: -1, // zero-width space: dropped
  0x2032: 0x27,
  0x2192: 0xbb, // → reads as »
};

/** One byte per character, in the fonts' encoding. */
export function encodeWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (code === 0x0a || code === 0x09) out.push(0x20);
    else if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff)) out.push(code);
    else if (CP1252[code] !== undefined) out.push(CP1252[code]);
    else if (FALLBACK[code] !== undefined) {
      if (FALLBACK[code] >= 0) out.push(FALLBACK[code]);
    } else if (code >= 0x20) out.push(0x3f);
  }
  return out;
}

function advance(byte: number, weight: FontWeight): number {
  const table = weight === "bold" ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  return table[byte - 32] || table[0x3f - 32];
}

/** Width in points of `text` set at `size` points. */
export function textWidth(text: string, weight: FontWeight, size: number): number {
  return (encodeWinAnsi(text).reduce((sum, byte) => sum + advance(byte, weight), 0) * size) / 1000;
}

/**
 * The lines `text` takes in `maxWidth` points: broken at spaces, a word too
 * long for a line broken where it overflows. Explicit line breaks are kept.
 */
export function wrapText(text: string, weight: FontWeight, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, weight, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      let rest = word;
      while (textWidth(rest, weight, size) > maxWidth) {
        const chars = Array.from(rest);
        let fit = 1;
        while (fit < chars.length && textWidth(chars.slice(0, fit + 1).join(""), weight, size) <= maxWidth) fit++;
        lines.push(chars.slice(0, fit).join(""));
        rest = chars.slice(fit).join("");
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}
