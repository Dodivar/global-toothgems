/**
 * Sharing a Studio design on social networks.
 *
 * A design lives in the customer's browser or private workspace: there is no
 * public page per creation. What can be shared is the render itself (through
 * the system share sheet, or downloaded and posted by hand) and the public
 * Studio page, through each network's own share link. No network script or
 * SDK is loaded: a share link is a plain URL opened in a new tab, only when
 * the customer asks for it.
 */

export type ShareNetwork = "whatsapp" | "facebook" | "x" | "linkedin" | "email";

/** In the order the share menu lists them. */
export const SHARE_NETWORKS: readonly ShareNetwork[] = ["whatsapp", "facebook", "x", "linkedin", "email"];

export interface ShareContent {
  /** The page to share: absolute, public. */
  url: string;
  /** The message that goes with it. */
  text: string;
  /** The e-mail subject. */
  title: string;
}

/** The share link of a network, pre-filled with the page and the message. */
export function shareLink(network: ShareNetwork, { url, text, title }: ShareContent): string {
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
