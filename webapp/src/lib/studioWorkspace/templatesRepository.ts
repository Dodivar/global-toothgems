import type { TypedSupabaseClient } from "../supabase/client";
import { BUCKETS, SIGNED_URL_TTL_SECONDS } from "../supabase/storage";
import { StudioStoreError } from "./repository";
import { storeError, toCreation } from "./supabaseRepository";
import { toTemplate, type StudioTemplate } from "./templates";
import type { Creation } from "./types";

/**
 * The template library's persistence boundary (decision 97). Screens reach it
 * through `templatesStore.tsx`, never directly.
 *
 *   list()          → `studio_templates()`      members with Studio access (42501 otherwise)
 *   use(template)   → `studio_use_template(id)` a copy in the caller's creations, then its render
 *                     copied into the caller's folder, best effort, like a duplicate
 *   setPublished()  → `studio_set_template()`   `manage_content` staff only
 *   canPublish()    → `my_permissions()`        navigation only: the database decides
 *
 * Template renders stay in their author's folder of the private bucket; the
 * storage policy lets members with Studio access read exactly those files.
 */
export interface TemplatesRepository {
  list(): Promise<StudioTemplate[]>;
  use(template: StudioTemplate): Promise<Creation>;
  /** The publication date, or null once unpublished. */
  setPublished(creationId: string, published: boolean): Promise<string | null>;
  canPublish(): Promise<boolean>;
}

export function createTemplatesRepository(client: TypedSupabaseClient, userId: string): TemplatesRepository {
  const thumbs = () => client.storage.from(BUCKETS.studioThumbnails);

  async function signed(paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!paths.length) return out;
    // Previews are decoration: a failure falls back to the drawn scene.
    const { data } = await thumbs().createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) out.set(entry.path, entry.signedUrl);
    }
    return out;
  }

  return {
    async list() {
      const { data, error } = await client.rpc("studio_templates");
      if (error) throw storeError(error);
      const paths = data.flatMap((r) => (r.thumbnail_path ? [r.thumbnail_path] : []));
      const urls = await signed(paths).catch(() => new Map<string, string>());
      return data.map((r) => toTemplate(r, r.thumbnail_path ? (urls.get(r.thumbnail_path) ?? null) : null));
    },

    async use(template: StudioTemplate) {
      const { data, error } = await client.rpc("studio_use_template", { p_template_id: template.id });
      if (error) throw storeError(error);
      if (!data?.id) throw new StudioStoreError("storage");
      if (!template.thumbnailPath) return toCreation(data, null);
      // The copy gets its own render file in the member's folder, so it never
      // depends on the template staying published.
      const path = `${userId}/${data.id}.jpg`;
      try {
        const { error: copyError } = await thumbs().copy(template.thumbnailPath, path);
        if (copyError) return toCreation(data, null);
        const { data: linked } = await client.from("creations").update({ thumbnail_path: path }).eq("id", data.id).select().single();
        if (!linked) return toCreation(data, null);
        const url = (await signed([path]).catch(() => new Map<string, string>())).get(path) ?? null;
        return toCreation(linked, url);
      } catch {
        return toCreation(data, null);
      }
    },

    async setPublished(creationId: string, published: boolean) {
      const { data, error } = await client.rpc("studio_set_template", { p_creation_id: creationId, p_published: published });
      if (error) throw storeError(error);
      return typeof data === "string" ? data : null;
    },

    async canPublish() {
      const { data, error } = await client.rpc("my_permissions");
      return !error && Array.isArray(data) && data.includes("manage_content");
    },
  };
}
