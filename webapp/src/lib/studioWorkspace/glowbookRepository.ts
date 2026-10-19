import type { TypedSupabaseClient } from "../supabase/client";
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
 *   publicState(id)  → a fresh read of what saving one creation would make public
 *                      (its Glowbook item, its template flag), for the warning before a save
 */
export interface GlowbookRepository {
  load(): Promise<{ glowbook: Glowbook | null; items: GlowbookItem[] }>;
  save(details: GlowbookDetails): Promise<Glowbook>;
  add(creationId: string): Promise<GlowbookItem>;
  remove(creationId: string): Promise<void>;
  reorder(creationIds: string[]): Promise<void>;
  removeAll(): Promise<void>;
  publicState(creationId: string): Promise<{ item: GlowbookItem | null; templatePublishedAt: string | null }>;
}

/** `handleTaken` / `handleReserved` / `full`: refusals the form explains. */
export type GlowbookErrorCode = "handleTaken" | "handleReserved" | "full";

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

export function createGlowbookRepository(client: TypedSupabaseClient, userId: string): GlowbookRepository {
  return {
    async load() {
      const [page, items] = await Promise.all([
        client.from("studio_showcases").select("*").eq("user_id", userId).maybeSingle(),
        client.from("studio_showcase_items").select("*").eq("user_id", userId),
      ]);
      if (page.error) throw storeError(page.error);
      if (items.error) throw storeError(items.error);
      return { glowbook: page.data ? toGlowbook(page.data) : null, items: items.data.map(toGlowbookItem) };
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

    async publicState(creationId) {
      const [item, creation] = await Promise.all([
        client.from("studio_showcase_items").select("*").eq("creation_id", creationId).maybeSingle(),
        client.from("creations").select("template_published_at").eq("id", creationId).maybeSingle(),
      ]);
      if (item.error) throw storeError(item.error);
      if (creation.error) throw storeError(creation.error);
      return { item: item.data ? toGlowbookItem(item.data) : null, templatePublishedAt: creation.data?.template_published_at ?? null };
    },
  };
}
