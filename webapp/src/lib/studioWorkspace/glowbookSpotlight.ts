/**
 * The Glowbook's spotlight video (decisions 103 and 105): the creation in the
 * spotlight, the camera sweeping in front of the smile from left to right and
 * back, at the top of the public page. Only a browser can draw it (WebGL), so
 * the artist's own Studio records it on a hidden stage and uploads it; the
 * database keeps it only while it matches the spotlight creation as it is now
 * and is of the current kind (`studio_spotlight_video_state().current`).
 * Pure: the length, row ↔ UI mapping and the "record now?" rule.
 */

/** Every spotlight video lasts this long (one left → right → left sweep); not a choice offered to the artist. */
export const SPOTLIGHT_SECONDS = 5;

export type SpotlightVideoType = "video/mp4" | "video/webm";

/** What the artist's Studio knows about its spotlight video. */
export interface SpotlightVideoState {
  /** The spotlight creation's Glowbook item, or null when none is chosen. */
  featuredItemId: string | null;
  /** The item the recorded video turns around (maybe a former spotlight), or null. */
  itemId: string | null;
  path: string | null;
  type: SpotlightVideoType | null;
  /** True when the video sweeps the spotlight creation as it is now. */
  current: boolean;
}

/** The video a visitor sees, as the public page reads it. */
export interface PublicSpotlightVideo {
  path: string;
  type: SpotlightVideoType;
}

const videoType = (v: unknown): SpotlightVideoType | null => (v === "video/mp4" || v === "video/webm" ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const asObject = (json: unknown): Record<string, unknown> | null =>
  json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;

/** `studio_spotlight_video_state()` → the state; null without a Glowbook. */
export function toSpotlightState(json: unknown): SpotlightVideoState | null {
  const o = asObject(json);
  if (!o) return null;
  const path = text(o.path);
  return {
    featuredItemId: text(o.featured_item_id),
    itemId: text(o.item_id),
    path,
    type: path ? videoType(o.type) : null,
    current: o.current === true && !!path,
  };
}

/** The public page's `look.spotlight_video`, read defensively; null for none. */
export function toPublicSpotlightVideo(json: unknown): PublicSpotlightVideo | null {
  const o = asObject(json);
  if (!o) return null;
  const path = text(o.path);
  const type = videoType(o.type);
  if (!path || !type) return null;
  return { path, type };
}

/** Whether the Studio should record a video now: a spotlight is chosen and its video is missing, stale or of an older kind. */
export function needsSpotlightVideo(state: SpotlightVideoState | null): boolean {
  return !!state?.featuredItemId && !state.current;
}

/** A new file name in the member's folder (never overwritten: a CDN must not serve an older video). */
export function spotlightVideoPath(userId: string, itemId: string, type: SpotlightVideoType, unique: string): string {
  return `${userId}/spotlight-${itemId}-${unique}.${type === "video/mp4" ? "mp4" : "webm"}`;
}
