import type { TypedSupabaseClient } from "../supabase/client";
import type { Json } from "../supabase/database.types";
import { BUCKETS, SIGNED_URL_TTL_SECONDS } from "../supabase/storage";
import type { MediaKind } from "./glowbookLook";
import { StudioStoreError } from "./repository";
import { storeError } from "./supabaseRepository";
import {
  normalizeHandle,
  normalizeInstagram,
  toGlowbook,
  toGlowbookItem,
  type Glowbook,
  type GlowbookDetails,
  type GlowbookItem,
} from "./glowbook";
import { SPOTLIGHT_SECONDS, spotlightVideoPath, toSpotlightState, type SpotlightVideoState, type SpotlightVideoType } from "./glowbookSpotlight";
import { normalizeSectionName, toCertifiedCourses, toGlowbookSection, type CertifiedCourse, type GlowbookSection } from "./glowbookSections";

/**
 * The Glowbook's persistence boundary for its owner (decision 99). Screens
 * reach it through `glowbookStore.tsx`, never directly.
 *
 *   load()           → the caller's `studio_showcases` row and items (RLS: their own)
 *   save(details)    → `studio_save_showcase()`   Studio access; new page / new handle → moderation
 *   add(creationId)  → `studio_showcase_add()`    Studio access; pending until a moderator approves
 *   remove(id)       → DELETE of their own item   any time, at once
 *   reorder(ids)     → `studio_showcase_reorder()`
 *   removeAll()      → DELETE of their own page (items go with it)
 *   saveLook(patch)  → `studio_save_showcase_look()`  colour, layout… live; pictures and links proposed
 *   uploadMedia()    → a new picture in `glowbook-media/<user id>/` (never overwritten)
 *   signMedia()      → signed URLs of the member's own pictures
 *   cleanupMedia()   → removes the member's pictures no page uses (storage refuses the others)
 *   publicState(id)  → a fresh read of what saving one creation would make public
 *                      (its Glowbook item, its template flag), for the warning before a save
 *   saveSection(id, name) → `studio_save_showcase_section()`   create (null id) or rename (decision 102)
 *   deleteSection(id)     → DELETE of their own section        any time; its creations keep no section
 *   reorderSections(ids)  → `studio_reorder_showcase_sections()`
 *   fileItem(item, sec)   → `studio_set_showcase_item_section()`  one section or none
 *   setShowCertification  → `studio_set_showcase_certification()` show or hide the badge
 *   certification()       → `studio_my_certification()`      the courses behind the badge
 *   downloadMedia(path)   → one of the member's own pictures, as a file (for the printable poster)
 *   spotlightState()      → `studio_spotlight_video_state()`   the spotlight video and whether it is current (decision 103)
 *   signSpotlightVideo()  → a signed URL of the member's own video (the Studio's preview)
 *   saveSpotlightVideo()  → a new file in `glowbook-videos/<user id>/`, then `studio_set_spotlight_video()`;
 *                           the member's other videos are removed (storage refuses the one in use)
 */
export interface GlowbookRepository {
  load(): Promise<{ glowbook: Glowbook | null; items: GlowbookItem[]; sections: GlowbookSection[] }>;
  save(details: GlowbookDetails): Promise<Glowbook>;
  add(creationId: string): Promise<GlowbookItem>;
  remove(creationId: string): Promise<void>;
  reorder(creationIds: string[]): Promise<void>;
  removeAll(): Promise<void>;
  saveLook(patch: Record<string, unknown>): Promise<Glowbook>;
  uploadMedia(kind: MediaKind, blob: Blob): Promise<string>;
  signMedia(paths: string[]): Promise<Map<string, string>>;
  cleanupMedia(keep: string[]): Promise<void>;
  publicState(creationId: string): Promise<{ item: GlowbookItem | null; templatePublishedAt: string | null }>;
  saveSection(id: string | null, name: string): Promise<GlowbookSection>;
  deleteSection(id: string): Promise<void>;
  reorderSections(ids: string[]): Promise<void>;
  fileItem(itemId: string, sectionId: string | null): Promise<GlowbookItem>;
  setShowCertification(visible: boolean): Promise<Glowbook>;
  certification(): Promise<CertifiedCourse[]>;
  downloadMedia(path: string): Promise<Blob>;
  spotlightState(): Promise<SpotlightVideoState | null>;
  signSpotlightVideo(path: string): Promise<string | null>;
  saveSpotlightVideo(video: {
    itemId: string;
    blob: Blob;
    type: SpotlightVideoType;
    creationUpdatedAt: string;
  }): Promise<SpotlightVideoState | null>;
}

/** `handleTaken` / `handleReserved` / `full` / `sectionTaken` / `sectionsFull`: refusals the forms explain. */
export type GlowbookErrorCode = "handleTaken" | "handleReserved" | "full" | "sectionTaken" | "sectionsFull";

export class GlowbookError extends Error {
  readonly code: GlowbookErrorCode;
  constructor(code: GlowbookErrorCode) {
    super(code);
    this.name = "GlowbookError";
    this.code = code;
  }
}

type PgError = { code?: string; message?: string };

function glowbookError(error: PgError): Error {
  if (error.code === "23505") return new GlowbookError("handleTaken");
  if (error.code === "54000") return new GlowbookError("full");
  if (error.code === "22023" && /reserved handle/i.test(error.message ?? "")) return new GlowbookError("handleReserved");
  return storeError(error);
}

function sectionError(error: PgError): Error {
  if (error.code === "23505") return new GlowbookError("sectionTaken");
  if (error.code === "54000") return new GlowbookError("sectionsFull");
  return storeError(error);
}

/**
 * The generated types say `string` for every argument; these functions take
 * SQL null for "none" (a new section, no section), which PostgREST passes on.
 */
const sqlNull = null as unknown as string;

export function createGlowbookRepository(client: TypedSupabaseClient, userId: string): GlowbookRepository {
  return {
    async load() {
      const [page, items, sections] = await Promise.all([
        client.from("studio_showcases").select("*").eq("user_id", userId).maybeSingle(),
        client.from("studio_showcase_items").select("*").eq("user_id", userId),
        client.from("studio_showcase_sections").select("*").eq("user_id", userId),
      ]);
      if (page.error) throw storeError(page.error);
      if (items.error) throw storeError(items.error);
      if (sections.error) throw storeError(sections.error);
      return {
        glowbook: page.data ? toGlowbook(page.data) : null,
        items: items.data.map(toGlowbookItem),
        sections: sections.data.map(toGlowbookSection),
      };
    },

    async save(details) {
      const { data, error } = await client.rpc("studio_save_showcase", {
        p_handle: normalizeHandle(details.handle),
        p_display_name: details.displayName.trim(),
        p_bio: details.bio.trim(),
        p_instagram: normalizeInstagram(details.instagram),
      });
      if (error) throw glowbookError(error);
      if (!data) throw new StudioStoreError("storage");
      return toGlowbook(data);
    },

    async add(creationId) {
      const { data, error } = await client.rpc("studio_showcase_add", { p_creation_id: creationId });
      if (error) throw glowbookError(error);
      if (!data?.id) throw new StudioStoreError("storage");
      return toGlowbookItem(data);
    },

    async remove(creationId) {
      const { error } = await client.from("studio_showcase_items").delete().eq("creation_id", creationId).eq("user_id", userId);
      if (error) throw storeError(error);
    },

    async reorder(creationIds) {
      const { error } = await client.rpc("studio_showcase_reorder", { p_creation_ids: creationIds });
      if (error) throw storeError(error);
    },

    async removeAll() {
      const { error } = await client.from("studio_showcases").delete().eq("user_id", userId);
      if (error) throw storeError(error);
    },

    async saveLook(patch) {
      const { data, error } = await client.rpc("studio_save_showcase_look", { p_look: patch as Json });
      if (error) throw storeError(error);
      if (!data) throw new StudioStoreError("storage");
      return toGlowbook(data);
    },

    async uploadMedia(kind, blob) {
      const path = `${userId}/${kind}-${crypto.randomUUID()}.jpg`;
      const { error } = await client.storage.from(BUCKETS.glowbookMedia).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw storeError(error);
      return path;
    },

    async signMedia(paths) {
      const out = new Map<string, string>();
      const unique = [...new Set(paths.filter(Boolean))];
      if (!unique.length) return out;
      const { data } = await client.storage.from(BUCKETS.glowbookMedia).createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
      for (const entry of data ?? []) if (entry.path && entry.signedUrl && !entry.error) out.set(entry.path, entry.signedUrl);
      return out;
    },

    async cleanupMedia(keep) {
      const bucket = client.storage.from(BUCKETS.glowbookMedia);
      const { data } = await bucket.list(userId, { limit: 100 });
      const stale = (data ?? []).map((f) => `${userId}/${f.name}`).filter((path) => !keep.includes(path));
      // Storage refuses to delete a picture a page uses or proposes: only the leftovers go.
      if (stale.length) await bucket.remove(stale);
    },

    async publicState(creationId) {
      const [item, creation] = await Promise.all([
        client.from("studio_showcase_items").select("*").eq("creation_id", creationId).maybeSingle(),
        client.from("creations").select("template_published_at").eq("id", creationId).maybeSingle(),
      ]);
      if (item.error) throw storeError(item.error);
      if (creation.error) throw storeError(creation.error);
      return { item: item.data ? toGlowbookItem(item.data) : null, templatePublishedAt: creation.data?.template_published_at ?? null };
    },

    async saveSection(id, name) {
      const { data, error } = await client.rpc("studio_save_showcase_section", { p_section_id: id ?? sqlNull, p_name: normalizeSectionName(name) });
      if (error) throw sectionError(error);
      if (!data?.id) throw new StudioStoreError("storage");
      return toGlowbookSection(data);
    },

    async deleteSection(id) {
      const { error } = await client.from("studio_showcase_sections").delete().eq("id", id).eq("user_id", userId);
      if (error) throw storeError(error);
    },

    async reorderSections(ids) {
      const { error } = await client.rpc("studio_reorder_showcase_sections", { p_section_ids: ids });
      if (error) throw storeError(error);
    },

    async fileItem(itemId, sectionId) {
      const { data, error } = await client.rpc("studio_set_showcase_item_section", { p_item_id: itemId, p_section_id: sectionId ?? sqlNull });
      if (error) throw storeError(error);
      if (!data?.id) throw new StudioStoreError("storage");
      return toGlowbookItem(data);
    },

    async setShowCertification(visible) {
      const { data, error } = await client.rpc("studio_set_showcase_certification", { p_visible: visible });
      if (error) throw storeError(error);
      if (!data) throw new StudioStoreError("storage");
      return toGlowbook(data);
    },

    async certification() {
      const { data, error } = await client.rpc("studio_my_certification");
      if (error) throw storeError(error);
      return toCertifiedCourses(data);
    },

    async downloadMedia(path) {
      const { data, error } = await client.storage.from(BUCKETS.glowbookMedia).download(path);
      if (error || !data) throw storeError(error ?? { message: "no file" });
      return data;
    },

    async spotlightState() {
      const { data, error } = await client.rpc("studio_spotlight_video_state");
      if (error) throw storeError(error);
      return toSpotlightState(data);
    },

    async signSpotlightVideo(path) {
      const { data } = await client.storage.from(BUCKETS.glowbookVideos).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      return data?.signedUrl ?? null;
    },

    async saveSpotlightVideo({ itemId, blob, type, creationUpdatedAt }) {
      const bucket = client.storage.from(BUCKETS.glowbookVideos);
      const path = spotlightVideoPath(userId, itemId, type, crypto.randomUUID());
      const upload = await bucket.upload(path, blob, { contentType: type, upsert: false });
      if (upload.error) throw storeError(upload.error);
      const { data, error } = await client.rpc("studio_set_spotlight_video", {
        p_item_id: itemId,
        p_path: path,
        p_type: type,
        p_seconds: SPOTLIGHT_SECONDS,
        p_creation_updated_at: creationUpdatedAt,
      });
      if (error) {
        await bucket.remove([path]);
        throw storeError(error);
      }
      // Older turns go; storage refuses to delete the one the page uses.
      const { data: files } = await bucket.list(userId, { limit: 100 });
      const stale = (files ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== path);
      if (stale.length) await bucket.remove(stale);
      return toSpotlightState(data);
    },
  };
}
