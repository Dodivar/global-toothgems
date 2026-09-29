/**
 * Sharing a Studio design on social networks.
 *
 * What goes out is the creation's read-only link (see
 * `studioWorkspace/share.ts`), through each network's own share page, and the
 * render itself through the system share sheet. No network script or SDK is
 * loaded: a share link is a plain URL opened in a new tab, only when the
 * customer asks for it.
 */

export type ShareNetwork = "whatsapp" | "facebook" | "x" | "linkedin" | "email";

/** In the order the share menu lists them. */
export const SHARE_NETWORKS: readonly ShareNetwork[] = ["whatsapp", "facebook", "x", "linkedin", "email"];

export interface ShareContent {
  /** The link to share: absolute (the creation's read-only link). */
  url: string;
  /** The message that goes with it. */
  text: string;
  /** The e-mail subject. */
  title: string;
}

/** The share page of a network, pre-filled with the link and the message. */
export function networkShareUrl(network: ShareNetwork, { url, text, title }: ShareContent): string {
  const u = encodeURIComponent(url);
  switch (network) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":
      return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${u}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "email":
      return `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`;
  }
}

/** Can this browser hand an image file to the system share sheet (Instagram, Messages…)? */
export function canShareFiles(file: File): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/** Open a network's share page: a new tab, cut off from this page; the mail app for e-mail. */
export function openShareLink(network: ShareNetwork, content: ShareContent) {
  const link = networkShareUrl(network, content);
  if (network === "email") window.location.assign(link);
  else window.open(link, "_blank", "noopener,noreferrer");
}
