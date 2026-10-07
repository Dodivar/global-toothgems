/**
 * Where a member can take their certificate, and what goes with it.
 *
 * There is no public certificate page (decided by the owner, 2026-10-07): an
 * achievement is shared as the certificate's image, which the member posts
 * themselves. So each network below is a destination opened next to the
 * exported image and a ready-to-paste caption, never a link to a page of ours
 * that would expose the holder. The one exception is LinkedIn's "add a
 * certification" form, which only receives the course name, the issuer, the
 * month and the reference — the member confirms it on LinkedIn.
 *
 * Pure: no DOM. Unit-tested in `share.test.ts`.
 */

export type ShareNetwork = "linkedin" | "instagram" | "facebook" | "x" | "email";

export const SHARE_NETWORKS: readonly ShareNetwork[] = ["linkedin", "instagram", "facebook", "x", "email"];

export const ISSUER = "Global Toothgems";

/** The address that opens a network's composer, the caption pre-filled where the network allows it. */
export function shareDestination(network: ShareNetwork, caption: string, subject: string): string {
  const text = encodeURIComponent(caption);
  switch (network) {
    case "linkedin":
      return `https://www.linkedin.com/feed/?shareActive=true&text=${text}`;
    case "x":
      return `https://x.com/intent/tweet?text=${text}`;
    case "facebook":
      // Facebook only pre-fills links, never text: the caption is on the clipboard.
      return "https://www.facebook.com/";
    case "instagram":
      return "https://www.instagram.com/";
    case "email":
      return `mailto:?subject=${encodeURIComponent(subject)}&body=${text}`;
  }
}

/**
 * LinkedIn's "Add licence or certification" form, pre-filled. `awardedOn` is
 * an ISO date (YYYY-MM-DD…).
 */
export function linkedInCertificationUrl(input: { courseTitle: string; awardedOn: string; reference: string }): string {
  const params = new URLSearchParams({
    startTask: "CERTIFICATION_NAME",
    name: input.courseTitle,
    organizationName: ISSUER,
    issueYear: input.awardedOn.slice(0, 4),
    issueMonth: String(Number(input.awardedOn.slice(5, 7))),
    certId: input.reference,
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

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
