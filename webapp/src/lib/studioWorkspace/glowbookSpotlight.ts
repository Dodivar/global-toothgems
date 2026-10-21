/**
 * The Glowbook's spotlight video (decision 103): the creation in the
 * spotlight, turning, at the top of the public page. Only a browser can draw
 * it (WebGL), so the artist's own Studio records it on a hidden stage and
 * uploads it; the database keeps it only while it matches the spotlight
 * creation as it is now (`studio_spotlight_video_state().current`). Pure:
 * durations, row ↔ UI mapping and the "record now?" rule.
 */

export const SPOTLIGHT_SECONDS = [4, 6, 8] as const;
export type SpotlightSeconds = (typeof SPOTLIGHT_SECONDS)[number];
export const DEFAULT_SPOTLIGHT_SECONDS: SpotlightSeconds = 4;

export type SpotlightVideoType = "video/mp4" | "video/webm";

/** What the artist's Studio knows about its spotlight video. */
export interface SpotlightVideoState {
  /** The spotlight creation's Glowbook item, or null when none is chosen. */
  featuredItemId: string | null;
  /** The item the recorded video turns around (maybe a former spotlight), or null. */
  itemId: string | null;
  path: string | null;
  type: SpotlightVideoType | null;
  seconds: SpotlightSeconds | null;
  /** True when the video turns around the spotlight creation as it is now. */
  current: boolean;
}

/** The video a visitor sees, as the public page reads it. */
export interface PublicSpotlightVideo {
  path: string;
  type: SpotlightVideoType;
  seconds: SpotlightSeconds;
}

export const isSpotlightSeconds = (v: unknown): v is SpotlightSeconds => SPOTLIGHT_SECONDS.includes(v as SpotlightSeconds);
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
    seconds: path && isSpotlightSeconds(o.seconds) ? o.seconds : null,
    current: o.current === true && !!path,
  };
}

/** The public page's `look.spotlight_video`, read defensively; null for none. */
export function toPublicSpotlightVideo(json: unknown): PublicSpotlightVideo | null {
  const o = asObject(json);
  if (!o) return null;
  const path = text(o.path);
  const type = videoType(o.type);
  if (!path || !type || !isSpotlightSeconds(o.seconds)) return null;
  return { path, type, seconds: o.seconds };
}

/**
 * The duration to record: the one the artist asked for, else the one of the
 * video they already have (a new design keeps its pace), else 4 seconds.
 */
export function spotlightSecondsFor(state: SpotlightVideoState | null, asked: SpotlightSeconds | null = null): SpotlightSeconds {
  return asked ?? state?.seconds ?? DEFAULT_SPOTLIGHT_SECONDS;
}

/** Whether the Studio should record a video now: a spotlight is chosen and its video is missing, stale or for another creation. */
export function needsSpotlightVideo(state: SpotlightVideoState | null): boolean {
  return !!state?.featuredItemId && !state.current;
}

/** A new file name in the member's folder (never overwritten: a CDN must not serve an older turn). */
export function spotlightVideoPath(userId: string, itemId: string, type: SpotlightVideoType, unique: string): string {
  return `${userId}/spotlight-${itemId}-${unique}.${type === "video/mp4" ? "mp4" : "webm"}`;
}
