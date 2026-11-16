import { placeFromJson, samePlace, validatePlace, type GlowbookPlace, type PlaceProblem } from "./glowbookPlace";

/**
 * The Glowbook's own look (decision 100): what an artist chooses for their
 * page — profile picture, banner, a creation in the spotlight, their city,
 * their place on a map (decision 108, `glowbookPlace.ts`). Since decision 150
 * the identity colour, background and layout are no longer the artist's: every
 * page is drawn in `GLOWBOOK_COLORS`, the database's `accent`, `background`
 * and `layout` columns stay unused and are ignored here. No outside link: since bookings are
 * taken on the page (decision 144), booking, website and TikTok links are gone
 * and the database refuses them (decision 146). Pure: the lists
 * the database accepts, the rules it checks (repeated so the form can say
 * what is wrong first), row ↔ UI mapping and the picture framing maths.
 *
 * Pictures are proposed: a new one waits for a moderator while the
 * page keeps the approved one (`pending`). Spotlight, city and place are live. Who may customise is one database switch
 * (`private.glowbook_customization_allowed`): every member with Studio access
 * today, a paid plan later.
 */

/**
 * Every Glowbook's colours (decision 150), Global Toothgems' own since
 * decision 152 (`index.css` tokens): `solid` the deep blue (`--gt-blue-700`;
 * map pin, poster band, icons — dark enough for white text on it, WCAG AA),
 * `soft` the pale blue tint (`--gt-blue-100`), `cta` the green call to action
 * (`--gt-emerald-400`, with ink text).
 */
export const GLOWBOOK_COLORS = { solid: "#3f5a75", soft: "#e7eef7", cta: "#3edba0" } as const;

export const LOCATION_MAX = 60;

/** The pictures that wait for a moderator. */
export const MODERATED_KEYS = ["avatarPath", "bannerPath"] as const;
export type ModeratedKey = (typeof MODERATED_KEYS)[number];

export interface GlowbookLook {
  location: string | null;
  /** Where the artist works (decision 108); null: not shown. */
  place: GlowbookPlace | null;
  featuredItemId: string | null;
  avatarPath: string | null;
  bannerPath: string | null;
}

export const DEFAULT_LOOK: GlowbookLook = {
  location: null,
  place: null,
  featuredItemId: null,
  avatarPath: null,
  bannerPath: null,
};

/** Database column ↔ UI field (the place travels as one `place` object). */
const COLUMN: Record<Exclude<keyof GlowbookLook, "place">, string> = {
  location: "location",
  featuredItemId: "featured_item_id",
  avatarPath: "avatar_path",
  bannerPath: "banner_path",
};

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** A look from a row or a JSON object using the database's column names. */
export function lookFromColumns(o: Record<string, unknown> | null | undefined): GlowbookLook {
  if (!o) return DEFAULT_LOOK;
  return {
    location: text(o.location),
    place: placeFromJson(o),
    featuredItemId: text(o.featured_item_id),
    avatarPath: text(o.avatar_path),
    bannerPath: text(o.banner_path),
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

export type LookProblem = "locationLength" | PlaceProblem;

export function validateLook(look: GlowbookLook): LookProblem | null {
  if (look.location && look.location.trim().length > LOCATION_MAX) return "locationLength";
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
