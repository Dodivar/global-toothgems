/**
 * Sharing a Studio design on social networks.
 *
 * What goes out is the creation's read-only link (see
 * `studioWorkspace/share.ts`), through each network's own share page: the
 * link's page carries the creation's name and render as its preview card
 * (decision 101, addendum 2026-10-21). The render itself goes through the
 * system share sheet. No network script or SDK is loaded: a share link is a
 * plain URL opened in a new tab, only when the customer asks for it.
 *
 * Instagram and TikTok take no link from a website: their entry copies the
 * link (for a story link sticker or the bio) and opens the network.
 */

export type ShareNetwork =
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "pinterest"
  | "snapchat"
  | "threads"
  | "x"
  | "linkedin"
  | "telegram"
  | "email";

/** In the order the share menu lists them. */
export const SHARE_NETWORKS: readonly ShareNetwork[] = [
  "whatsapp",
  "facebook",
  "instagram",
  "tiktok",
  "pinterest",
  "snapchat",
  "threads",
  "x",
  "linkedin",
  "telegram",
  "email",
];

export interface ShareContent {
  /** The link to share: absolute (the creation's read-only link). */
  url: string;
  /** The message that goes with it. */
  text: string;
  /** The e-mail subject. */
  title: string;
}

/**
 * What an entry does:
 *   open          the network's share page, pre-filled with the link;
 *   copyThenOpen  the link is copied, then the network opens (no link intent);
 *   mail          the mail app.
 */
export type ShareAction = { kind: "open" | "copyThenOpen" | "mail"; url: string };

export function networkShareAction(network: ShareNetwork, { url, text, title }: ShareContent): ShareAction {
  const u = encodeURIComponent(url);
  const m = encodeURIComponent(text);
  const withLink = encodeURIComponent(`${text} ${url}`);
  switch (network) {
    case "whatsapp":
      return { kind: "open", url: `https://wa.me/?text=${withLink}` };
    case "facebook":
      return { kind: "open", url: `https://www.facebook.com/sharer/sharer.php?u=${u}` };
    case "instagram":
      return { kind: "copyThenOpen", url: "https://www.instagram.com/" };
    case "tiktok":
      return { kind: "copyThenOpen", url: "https://www.tiktok.com/" };
    case "pinterest":
      // The "link" builder reads the page's own images (its og:image is the render).
      return { kind: "open", url: `https://www.pinterest.com/pin/create/link/?url=${u}&description=${m}` };
    case "snapchat":
      return { kind: "open", url: `https://www.snapchat.com/scan?attachmentUrl=${u}` };
    case "threads":
      return { kind: "open", url: `https://www.threads.net/intent/post?text=${withLink}` };
    case "x":
      return { kind: "open", url: `https://x.com/intent/tweet?text=${m}&url=${u}` };
    case "linkedin":
      return { kind: "open", url: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` };
    case "telegram":
      return { kind: "open", url: `https://t.me/share/url?url=${u}&text=${m}` };
    case "email":
      return { kind: "mail", url: `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${text}\n\n${url}`)}` };
  }
}

/** Can this browser hand an image file to the system share sheet (Instagram, Messages…)? */
export function canShareFiles(file: File): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

/**
 * Run a network's entry, right in the click. Resolves to whether the link was
 * copied (`null` when nothing was to copy), for the caller's message.
 *
 * The copy starts before the new tab opens: the clipboard needs this page to
 * still have the focus.
 */
export async function openShareLink(network: ShareNetwork, content: ShareContent): Promise<boolean | null> {
  const action = networkShareAction(network, content);
  if (action.kind === "mail") {
    window.location.assign(action.url);
    return null;
  }
  const copy = action.kind === "copyThenOpen" ? navigator.clipboard.writeText(content.url) : null;
  window.open(action.url, "_blank", "noopener,noreferrer");
  if (!copy) return null;
  try {
    await copy;
    return true;
  } catch {
    return false;
  }
}
