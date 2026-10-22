import { placeFromJson, samePlace, validatePlace, type GlowbookPlace, type PlaceProblem } from "./glowbookPlace";

/**
 * The Glowbook's own look (decision 100): what an artist chooses so the page
 * looks like them — profile picture, banner, identity colour, background,
 * layout, a creation in the spotlight, their city, their place on a map
 * (decision 108, `glowbookPlace.ts`) and links. Pure: the lists
 * the database accepts, the rules it checks (repeated so the form can say
 * what is wrong first), row ↔ UI mapping and the picture framing maths.
 *
 * Pictures and links are proposed: a new one waits for a moderator while the
 * page keeps the approved one (`pending`). Colour, background, layout,
 * spotlight, city and place are live. Who may customise is one database switch
 * (`private.glowbook_customization_allowed`): every member with Studio access
 * today, a paid plan later.
 */

export const ACCENTS = ["ink", "blue", "fuchsia", "rose", "coral", "gold", "emerald", "teal", "violet", "plum"] as const;
export type Accent = (typeof ACCENTS)[number];

/**
 * The identity colours. Each is dark enough for white text on it (WCAG AA,
 * 4.5:1) and readable as text on the light page; `soft` tints the light
 * background, `bright` is the colour on the dark one.
 */
export const ACCENT_COLORS: Record<Accent, { solid: string; soft: string; bright: string }> = {
  ink: { solid: "#1b1d22", soft: "#f1f1f3", bright: "#e9e9ee" },
  blue: { solid: "#2a5a9e", soft: "#eaf1fb", bright: "#8fb6ee" },
  fuchsia: { solid: "#a8115f", soft: "#fbeaf3", bright: "#f28cc2" },
  rose: { solid: "#b4234a", soft: "#fcecf0", bright: "#f59ab2" },
  coral: { solid: "#b2431f", soft: "#fdeee8", bright: "#f7a283" },
  gold: { solid: "#86600b", soft: "#fbf4e2", bright: "#e9c46a" },
  emerald: { solid: "#0b7e5b", soft: "#e7f6f0", bright: "#6fd3ad" },
  teal: { solid: "#0f6f73", soft: "#e6f4f4", bright: "#6cc9cc" },
  violet: { solid: "#5b3cc4", soft: "#efebfb", bright: "#ab98f2" },
  plum: { solid: "#6e2a78", soft: "#f4eaf6", bright: "#cf98d8" },
};

export const BACKGROUNDS = ["light", "tinted", "dark"] as const;
export type Background = (typeof BACKGROUNDS)[number];
export const LAYOUTS = ["grid", "large"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const LOCATION_MAX = 60;
export const LINK_MAX = 300;

/** The pictures and links that wait for a moderator. */
export const MODERATED_KEYS = ["avatarPath", "bannerPath", "bookingUrl", "websiteUrl", "tiktok"] as const;
export type ModeratedKey = (typeof MODERATED_KEYS)[number];

export interface GlowbookLook {
  accent: Accent;
  background: Background;
  layout: Layout;
  location: string | null;
  /** Where the artist works (decision 108); null: not shown. */
  place: GlowbookPlace | null;
  featuredItemId: string | null;
  avatarPath: string | null;
  bannerPath: string | null;
  bookingUrl: string | null;
  websiteUrl: string | null;
  tiktok: string | null;
}

export const DEFAULT_LOOK: GlowbookLook = {
  accent: "ink",
  background: "light",
  layout: "grid",
  location: null,
  place: null,
  featuredItemId: null,
  avatarPath: null,
  bannerPath: null,
  bookingUrl: null,
  websiteUrl: null,
  tiktok: null,
};

/** Database column ↔ UI field (the place travels as one `place` object). */
const COLUMN: Record<Exclude<keyof GlowbookLook, "place">, string> = {
  accent: "accent",
  background: "background",
  layout: "layout",
  location: "location",
  featuredItemId: "featured_item_id",
  avatarPath: "avatar_path",
  bannerPath: "banner_path",
  bookingUrl: "booking_url",
  websiteUrl: "website_url",
  tiktok: "tiktok",
};

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** A look from a row or a JSON object using the database's column names. */
export function lookFromColumns(o: Record<string, unknown> | null | undefined): GlowbookLook {
  if (!o) return DEFAULT_LOOK;
  return {
    accent: oneOf(ACCENTS, o.accent, "ink"),
    background: oneOf(BACKGROUNDS, o.background, "light"),
    layout: oneOf(LAYOUTS, o.layout, "grid"),
    location: text(o.location),
    place: placeFromJson(o),
    featuredItemId: text(o.featured_item_id),
    avatarPath: text(o.avatar_path),
    bannerPath: text(o.banner_path),
    bookingUrl: text(o.booking_url),
    websiteUrl: text(o.website_url),
    tiktok: text(o.tiktok),
  };
}

/** What waits for a moderator, from `pending_changes`. A key present with a value replaces the approved one. */
export function pendingFromColumns(json: unknown): Partial<Pick<GlowbookLook, ModeratedKey>> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const o = json as Record<string, unknown>;
  const out: Partial<Pick<GlowbookLook, ModeratedKey>> = {};
  for (const key of MODERATED_KEYS) {
    const v = text(o[COLUMN[key]]);
    if (v) out[key] = v;
  }
  return out;
}

/** The changes between two looks, as `studio_save_showcase_look`'s argument (column names; null removes; the place whole). */
export function lookPatch(from: GlowbookLook, to: GlowbookLook): Record<string, string | GlowbookPlace | null> {
  const patch: Record<string, string | GlowbookPlace | null> = {};
  for (const key of Object.keys(COLUMN) as (keyof typeof COLUMN)[]) {
    if (from[key] !== to[key]) patch[COLUMN[key]] = to[key];
  }
  if (!samePlace(from.place, to.place)) patch.place = to.place;
  return patch;
}

export type LookProblem = "locationLength" | "bookingUrl" | "websiteUrl" | "tiktok" | PlaceProblem;

export const isHttpsLink = (url: string) => /^https:\/\/[^\s<>"]+$/.test(url) && url.length >= 11 && url.length <= LINK_MAX;

/** A link as typed ("monsite.fr", "https://…") → the https address to store, or the text unchanged to be refused. */
export function normalizeLink(raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  if (/^https:\/\//i.test(v)) return v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return v; // another scheme: refused by the check
  return `https://${v.replace(/^\/+/, "")}`;
}

export function validateLook(look: GlowbookLook): LookProblem | null {
  if (look.location && look.location.trim().length > LOCATION_MAX) return "locationLength";
  if (look.bookingUrl && !isHttpsLink(look.bookingUrl)) return "bookingUrl";
  if (look.websiteUrl && !isHttpsLink(look.websiteUrl)) return "websiteUrl";
  if (look.tiktok && !/^[A-Za-z0-9._]{2,24}$/.test(look.tiktok.replace(/^@/, ""))) return "tiktok";
  return validatePlace(look.place);
}

/* --------------------------------------------------------- picture framing */

export type MediaKind = "avatar" | "banner";

/** Output sizes: a square profile picture, a 3:1 banner. */
export const MEDIA_SIZE: Record<MediaKind, { width: number; height: number }> = {
  avatar: { width: 480, height: 480 },
  banner: { width: 1500, height: 500 },
};

/** Pictures taken from the device are refused above this, before decoding. */
export const MEDIA_MAX_INPUT_BYTES = 20 * 1024 * 1024;

/** The centred part of a `width × height` picture that fills the target ratio (like CSS `object-fit: cover`). */
export function coverCrop(width: number, height: number, ratio: number): { sx: number; sy: number; sw: number; sh: number } {
  if (!(width > 0) || !(height > 0) || !(ratio > 0)) return { sx: 0, sy: 0, sw: Math.max(0, width), sh: Math.max(0, height) };
  if (width / height > ratio) {
    const sw = Math.round(height * ratio);
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }
  const sh = Math.round(width / ratio);
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
}

/** Initials for the default avatar: "Lily Gems" → "LG". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export const tiktokUrl = (account: string) => `https://www.tiktok.com/@${encodeURIComponent(account.replace(/^@/, ""))}`;
