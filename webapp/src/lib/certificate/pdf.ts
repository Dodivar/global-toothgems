/**
 * A one-page PDF holding one JPEG, written by hand.
 *
 * The certificate is drawn on a canvas (`renderCertificate.ts`) and exported as
 * a JPEG; wrapping that image in a PDF is a few dozen bytes of structure, which
 * is not worth a dependency (AGENTS.md §12). The page is A4 landscape and the
 * image fills it, so the file prints at the size the certificate was designed
 * for. Pure: no DOM, no canvas — unit-tested in `pdf.test.ts`.
 */

/** A4 landscape in PDF points (1/72 in). */
export const A4_LANDSCAPE_PT = { width: 841.89, height: 595.28 } as const;

const encoder = new TextEncoder();

/** A PDF text string in UTF-16BE (hex), so accented titles survive. */
function pdfText(value: string): string {
  let hex = "FEFF";
  for (let i = 0; i < value.length; i++) hex += value.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

export function jpegToPdf(jpeg: Uint8Array, image: { width: number; height: number }, meta: { title: string; author: string }): Uint8Array {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG");
  if (!(image.width > 0 && image.height > 0)) throw new Error("invalid image size");
  const { width, height } = A4_LANDSCAPE_PT;

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (body: () => void) => {
    offsets.push(length);
    push(`${offsets.length} 0 obj\n`);
    body();
    push("\nendobj\n");
  };

  // The binary comment tells transfer tools the file is not plain text.
  push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  object(() => push("<< /Type /Catalog /Pages 2 0 R >>"));
  object(() => push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  object(() =>
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    ),
  );
  object(() => {
    push(
      `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    push(jpeg);
    push("\nendstream");
  });
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
  object(() => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  object(() => push(`<< /Title ${pdfText(meta.title)} /Author ${pdfText(meta.author)} /Producer (Global Toothgems) >>`));

  const xref = length;
  push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets) push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R /Info ${offsets.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
