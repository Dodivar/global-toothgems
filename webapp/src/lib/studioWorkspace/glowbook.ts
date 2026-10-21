import type { Database } from "../supabase/database.types";
import { lookFromColumns, pendingFromColumns, type GlowbookLook, type ModeratedKey } from "./glowbookLook";
import { toCertifiedCourses, toPublicSections, type CertifiedCourse } from "./glowbookSections";
import { toPublicSpotlightVideo, type PublicSpotlightVideo } from "./glowbookSpotlight";

/**
 * The Glowbook: an artist's public, read-only showcase of chosen creations,
 * the page they link from their Instagram bio (decision 99). Pure: types,
 * the rules the database enforces (repeated here so the form can say what is
 * wrong before sending), and row ↔ UI mapping. No React, no Supabase client.
 *
 * Nothing is public before a moderator approves it: the page (handle, name,
 * bio, Instagram) and each creation. Afterwards edits are live — saving an
 * approved creation changes the public page at once — except a new handle,
 * which goes back to moderation. The page is shown only while its author has
 * Studio access.
 */

export type ModerationStatus = "pending" | "approved" | "rejected";

export interface Glowbook {
  handle: string;
  displayName: string;
  bio: string;
  /** Without the "@". */
  instagram: string | null;
  status: ModerationStatus;
  /** The moderator's reason, shown to the artist when rejected. */
  reviewNote: string | null;
  submittedAt: string;
  /** The approved look, as the public sees it (decision 100). */
  look: GlowbookLook;
  /** Pictures and links proposed, waiting for a moderator. */
  pending: Partial<Pick<GlowbookLook, ModeratedKey>>;
  /** Why the last proposed pictures or links were declined (empty when no reason was given). */
  changesReviewNote: string | null;
  /** Whether the page shows the "certified artist" badge when the artist has earned it (decision 102). */
  showCertification: boolean;
}

export interface GlowbookItem {
  id: string;
  creationId: string;
  position: number;
  status: ModerationStatus;
  reviewNote: string | null;
  submittedAt: string;
  /** The section it is filed in (decision 102), or null. */
  sectionId: string | null;
}

export interface GlowbookDetails {
  handle: string;
  displayName: string;
  bio: string;
  instagram: string;
}

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 300;
export const GLOWBOOK_MAX_ITEMS = 60;
export const REVIEW_NOTE_MAX = 500;

/** Same list as `studio_save_showcase()`. */
const RESERVED = new Set([
  "admin", "api", "app", "aide", "help", "support", "contact", "studio", "studio-3d", "3d-studio",
  "glowbook", "boutique", "shop", "academy", "compte", "account", "moderation", "staff", "www",
  "globaltoothgems", "global-toothgems", "global.toothgems", "toothgems",
]);

const HANDLE_PATTERN = /^[a-z0-9]([a-z0-9._-]{1,28})[a-z0-9]$/;
const INSTAGRAM_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

export const normalizeHandle = (raw: string) => raw.trim().toLowerCase();
export const normalizeInstagram = (raw: string) => raw.trim().replace(/^@/, "");

/** A suggestion from a display name: "Lily Gems" → "lily-gems". */
export function suggestHandle(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[._-]{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, HANDLE_MAX)
    .replace(/[._-]+$/g, "");
}

export type GlowbookProblem =
  | "handleLength"
  | "handleCharacters"
  | "handleReserved"
  | "displayNameRequired"
  | "displayNameLength"
  | "bioLength"
  | "instagramInvalid";

/** The first problem with the form, or null. Mirrors the database's checks. */
export function validateGlowbook(d: GlowbookDetails): GlowbookProblem | null {
  const handle = normalizeHandle(d.handle);
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) return "handleLength";
  if (!HANDLE_PATTERN.test(handle) || /[._-]{2}/.test(handle)) return "handleCharacters";
  if (RESERVED.has(handle)) return "handleReserved";
  const name = d.displayName.trim();
  if (!name) return "displayNameRequired";
  if (name.length > DISPLAY_NAME_MAX) return "displayNameLength";
  if (d.bio.trim().length > BIO_MAX) return "bioLength";
  const ig = normalizeInstagram(d.instagram);
  if (ig && !INSTAGRAM_PATTERN.test(ig)) return "instagramInvalid";
  return null;
}

type ShowcaseRow = Database["public"]["Tables"]["studio_showcases"]["Row"];
type ItemRow = Database["public"]["Tables"]["studio_showcase_items"]["Row"];

const asStatus = (s: string): ModerationStatus => (s === "approved" || s === "rejected" ? s : "pending");

export function toGlowbook(row: ShowcaseRow): Glowbook {
  return {
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio,
    instagram: row.instagram,
    status: asStatus(row.status),
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    look: lookFromColumns(row as unknown as Record<string, unknown>),
    pending: pendingFromColumns(row.pending_changes),
    changesReviewNote: row.changes_review_note,
    showCertification: row.show_certification,
  };
}

export function toGlowbookItem(row: ItemRow): GlowbookItem {
  return {
    id: row.id,
    creationId: row.creation_id,
    position: row.position,
    status: asStatus(row.status),
    reviewNote: row.review_note,
    submittedAt: row.submitted_at,
    sectionId: row.section_id,
  };
}

export const sortItems = (items: GlowbookItem[]) =>
  [...items].sort((a, b) => a.position - b.position || a.submittedAt.localeCompare(b.submittedAt));

/** Moves one creation up (-1) or down (+1); the new order of creation ids. */
export function moveItem(items: GlowbookItem[], creationId: string, delta: -1 | 1): string[] {
  const ids = sortItems(items).map((i) => i.creationId);
  const from = ids.indexOf(creationId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

/**
 * What saving a creation would make public, for the warning before the save:
 * `glowbook` when it is in the artist's Glowbook (approved, or pending and
 * public as soon as it is approved), `template` when it is a published
 * Global Toothgems template (live for every member), else null.
 */
export type PublicExposure = "glowbookLive" | "glowbookPending" | "template";

export function exposureOf(item: Pick<GlowbookItem, "status"> | null | undefined, templatePublishedAt: string | null): PublicExposure | null {
  if (templatePublishedAt) return "template";
  if (item?.status === "approved") return "glowbookLive";
  if (item?.status === "pending") return "glowbookPending";
  return null;
}

/* ------------------------------------------------------------ public page */

export interface PublicGlowbookItem {
  id: string;
  name: string;
  description: string;
  elementCount: number;
  thumbnailPath: string | null;
  updatedAt: string;
  /** Its section (decision 102); always null when sections are not open to the artist. */
  sectionId: string | null;
}

export interface PublicGlowbook {
  handle: string;
  displayName: string;
  bio: string;
  instagram: string | null;
  location: string | null;
  /** The artist's approved look; null when customisation is not open to them (default look). */
  look: GlowbookLook | null;
  /** The spotlight creation turning (decision 103), while it matches the creation; null otherwise. */
  spotlightVideo: PublicSpotlightVideo | null;
  /** Sections holding at least one public creation, in the artist's order (decision 102). */
  sections: { id: string; name: string }[];
  /** The courses behind the "certified artist" badge; null when there is none or the artist hides it. */
  certification: CertifiedCourse[] | null;
  items: PublicGlowbookItem[];
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Reads `studio_public_showcase()`'s JSON defensively; null when there is no public page. */
export function toPublicGlowbook(json: unknown): PublicGlowbook | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  if (!str(o.handle) || !str(o.display_name)) return null;
  const items = Array.isArray(o.items) ? o.items : [];
  const cert = o.certification && typeof o.certification === "object" ? toCertifiedCourses((o.certification as Record<string, unknown>).courses) : [];
  const sections = toPublicSections(o.sections);
  const known = new Set(sections.map((x) => x.id));
  const look = o.look && typeof o.look === "object" && !Array.isArray(o.look) ? (o.look as Record<string, unknown>) : null;
  return {
    handle: str(o.handle),
    displayName: str(o.display_name),
    bio: str(o.bio),
    instagram: str(o.instagram) || null,
    location: str(o.location) || null,
    look: look ? lookFromColumns(look) : null,
    spotlightVideo: look ? toPublicSpotlightVideo(look.spotlight_video) : null,
    sections,
    certification: cert.length ? cert : null,
    items: items.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const i = raw as Record<string, unknown>;
      if (!str(i.id)) return [];
      return [
        {
          id: str(i.id),
          name: str(i.name),
          description: str(i.description),
          elementCount: typeof i.element_count === "number" ? i.element_count : 0,
          thumbnailPath: str(i.thumbnail_path) || null,
          updatedAt: str(i.updated_at),
          sectionId: known.has(str(i.section_id)) ? str(i.section_id) : null,
        },
      ];
    }),
  };
}

export const instagramUrl = (account: string) => `https://www.instagram.com/${encodeURIComponent(account)}/`;
