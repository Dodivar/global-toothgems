import type { ShareFormat } from "./formats";
import type { ShareOutput } from "./motion";

/**
 * One button per social network, for an export already made (decision 101,
 * addendum 2026-10-21: no publishing API, no developer app, no OAuth).
 *
 *   phone    the system share sheet with the file — the member picks the app;
 *   desktop  the network's link-share page with the creation's PUBLIC page
 *            (its preview card shows the creation) when the network has one
 *            and a public page exists; otherwise the file is downloaded and
 *            the network's own create / upload page opens in a new tab.
 *
 * Pure: URLs and advice only.
 */

export type SocialNetwork = "tiktok" | "instagram" | "pinterest" | "facebook" | "snapchat" | "whatsapp" | "x" | "threads";

/** In the order the dialog lists them. */
export const SOCIAL_NETWORKS: readonly SocialNetwork[] = ["instagram", "tiktok", "pinterest", "facebook", "snapchat", "whatsapp", "x", "threads"];

export interface NetworkSpec {
  /** The page where a member creates a post by hand (desktop, file downloaded first). */
  uploadUrl: string;
  /** Has a documented web intent taking a link. */
  linkIntent: boolean;
  /** The format that fits best, for a still and for a turning one. */
  format: { still: ShareFormat; motion: ShareFormat };
  /** Takes WebM video files (Instagram, TikTok and Snapchat want MP4). */
  acceptsWebm: boolean;
  /** Plays an animated GIF as such. */
  acceptsGif: boolean;
}

export const NETWORKS: Record<SocialNetwork, NetworkSpec> = {
  instagram: { uploadUrl: "https://www.instagram.com/", linkIntent: false, format: { still: "portrait", motion: "story" }, acceptsWebm: false, acceptsGif: false },
  tiktok: { uploadUrl: "https://www.tiktok.com/upload", linkIntent: false, format: { still: "story", motion: "story" }, acceptsWebm: false, acceptsGif: false },
  pinterest: { uploadUrl: "https://www.pinterest.com/pin-builder/", linkIntent: true, format: { still: "portrait", motion: "story" }, acceptsWebm: false, acceptsGif: true },
  facebook: { uploadUrl: "https://www.facebook.com/", linkIntent: true, format: { still: "portrait", motion: "portrait" }, acceptsWebm: true, acceptsGif: true },
  snapchat: { uploadUrl: "https://www.snapchat.com/web", linkIntent: false, format: { still: "story", motion: "story" }, acceptsWebm: false, acceptsGif: false },
  whatsapp: { uploadUrl: "https://web.whatsapp.com/", linkIntent: true, format: { still: "square", motion: "portrait" }, acceptsWebm: false, acceptsGif: true },
  x: { uploadUrl: "https://x.com/compose/post", linkIntent: true, format: { still: "portrait", motion: "portrait" }, acceptsWebm: false, acceptsGif: true },
  threads: { uploadUrl: "https://www.threads.net/", linkIntent: true, format: { still: "portrait", motion: "portrait" }, acceptsWebm: false, acceptsGif: true },
};

export function isSocialNetwork(value: unknown): value is SocialNetwork {
  return typeof value === "string" && (SOCIAL_NETWORKS as readonly string[]).includes(value);
}

/** The format to preselect when a member picks this network. */
export function recommendedFormat(network: SocialNetwork, output: ShareOutput): ShareFormat {
  return output === "image" ? NETWORKS[network].format.still : NETWORKS[network].format.motion;
}

/** Whether the network takes this file as it is: WebM and GIF are the doubtful ones. */
export function fileFits(network: SocialNetwork, fileType: string): boolean {
  if (fileType.startsWith("video/webm")) return NETWORKS[network].acceptsWebm;
  if (fileType === "image/gif") return NETWORKS[network].acceptsGif;
  return true;
}

export interface LinkShare {
  /** The creation's public page, absolute https URL. */
  url: string;
  /** The message that goes with it. */
  text: string;
  /** A public image of the creation (Pinterest needs one). */
  imageUrl?: string | null;
}

/** The network's own link-share page, pre-filled; null when it has none (or Pinterest has no image). */
export function linkShareUrl(network: SocialNetwork, { url, text, imageUrl }: LinkShare): string | null {
  const u = encodeURIComponent(url);
  const m = encodeURIComponent(text);
  switch (network) {
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":
      return `https://x.com/intent/post?text=${m}&url=${u}`;
    case "threads":
      return `https://www.threads.net/intent/post?text=${encodeURIComponent(`${text} ${url}`)}`;
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
    case "pinterest":
      return imageUrl ? `https://www.pinterest.com/pin/create/button/?url=${u}&media=${encodeURIComponent(imageUrl)}&description=${m}` : null;
    default:
      return null;
  }
}

export type DesktopAction = { kind: "link"; url: string } | { kind: "upload"; url: string };

/**
 * What a click does on a computer: the link-share page when the network has
 * one and a public page is available, otherwise download + the create page.
 */
export function desktopAction(network: SocialNetwork, link: LinkShare | null): DesktopAction {
  const shared = link && NETWORKS[network].linkIntent ? linkShareUrl(network, link) : null;
  return shared ? { kind: "link", url: shared } : { kind: "upload", url: NETWORKS[network].uploadUrl };
}

/** Network names are brands: the same in every language. */
export const NETWORK_NAMES: Record<SocialNetwork, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  facebook: "Facebook",
  snapchat: "Snapchat",
  whatsapp: "WhatsApp",
  x: "X",
  threads: "Threads",
};
