/**
 * Sharing a certificate. There is no public certificate page (decided by the
 * owner, 2026-10-07): an achievement is shared as the certificate's image,
 * which the member posts themselves through the share sheet or after a
 * download — no list of networks (owner's choice 2026-11-06).
 *
 * Pure: no DOM. Unit-tested in `certificate.test.ts`.
 */

export const ISSUER = "Global Toothgems";

/** File name of an exported certificate: ASCII, no spaces, the reference last. */
export function certificateFileName(courseTitle: string, reference: string, extension: "pdf" | "png"): string {
  const slug = courseTitle
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `global-toothgems-${slug || "certificate"}-${reference.toLowerCase()}.${extension}`;
}
