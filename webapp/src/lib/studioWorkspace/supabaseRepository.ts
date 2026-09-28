import { ESTIMATE_PRICING } from "../../data/studioEditor";
import type { TypedSupabaseClient } from "../supabase/client";
import type { Json, Tables } from "../supabase/database.types";
import { BUCKETS, SIGNED_URL_TTL_SECONDS } from "../supabase/storage";
import { groupEstimateCents, sanitizeGroupData } from "./gemGroup";
import {
  StudioStoreError,
  type CreationInput,
  type CreationPatch,
  type GemGroupInput,
  type GemGroupPatch,
  type StudioRepositories,
} from "./repository";
import { sanitizeScene, sceneStats } from "./scene";
import type { Creation, FeedbackInput, GemGroup } from "./types";
import { normalizeDetails, normalizeTags, validateDetails, validateFeedback } from "./validation";

/**
 * The Studio workspace on Supabase (`supabase/migrations/…_studio_workspace.sql`).
 *
 * The client only ever sends the content: `user_id` defaults to `auth.uid()`
 * and is not writable, row-level security keeps every query to the signed-in
 * member's rows, and the timestamps and the piece count are set by Postgres.
 * Rows coming back are re-validated like any untrusted input.
 *
 * Thumbnails are best effort, as in the local store: the design is saved first,
 * then its render is uploaded to `studio-thumbnails/<user id>/<creation id>.jpg`
 * and served by signed URL. A failed upload leaves the card on its drawn preview.
 */

type CreationRow = Tables<"creations">;
type GroupRow = Tables<"gem_groups">;

const THUMB_BUCKET = BUCKETS.studioThumbnails;
/** Matches the bucket's limit (512 kB); a captured JPEG is ~30–60 kB. */
const THUMB_MAX_BYTES = 524_288;

interface PgError {
  code?: string;
  message?: string;
}

function storeError(error: PgError | null | undefined): StudioStoreError {
  switch (error?.code) {
    case "23514": // check violation
    case "23502":
    case "22P02":
    case "22023":
      return new StudioStoreError("invalid");
    case "PGRST116": // no row (or not ours: RLS hides it)
      return new StudioStoreError("notFound");
  }
  if (/failed to fetch|network/i.test(error?.message ?? "")) return new StudioStoreError("unavailable");
  return new StudioStoreError("storage");
}

function checkDetails(details: { name: string; description: string; tags: string[] }) {
  const problem = validateDetails(details);
  if (problem) throw new StudioStoreError("invalid", problem);
  return normalizeDetails(details);
}

const hasDetails = (p: { name?: string; description?: string; tags?: string[] }) =>
  p.name !== undefined || p.description !== undefined || p.tags !== undefined;

function toCreation(row: CreationRow, thumbnailUrl: string | null): Creation {
  const scene = sanitizeScene(row.scene_data);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    tags: normalizeTags(row.tags ?? []),
    scene,
    // The count and estimate follow the scene as read back, so the card never disagrees with it.
    ...sceneStats(scene.pieces),
    thumbnailUrl,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
  };
}

function toGroup(row: GroupRow): GemGroup | null {
  const data = sanitizeGroupData(row.group_data);
  if (!data) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    tags: normalizeTags(row.tags ?? []),
    data,
    elementCount: data.pieces.length,
    estimatedPriceMinor: groupEstimateCents(data.pieces),
    currency: row.currency,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

/** A captured `data:image/…` URL as an uploadable blob; null when it is not one of ours. */
async function thumbnailBlob(dataUrl: string): Promise<Blob | null> {
  if (!/^data:image\/(jpeg|webp|png);base64,/.test(dataUrl)) return null;
  const blob = await (await fetch(dataUrl)).blob();
  return blob.size > 0 && blob.size <= THUMB_MAX_BYTES ? blob : null;
}

export function createSupabaseRepositories(client: TypedSupabaseClient, userId: string): StudioRepositories {
  const thumbPath = (creationId: string) => `${userId}/${creationId}.jpg`;
  const thumbs = () => client.storage.from(THUMB_BUCKET);

  async function signed(paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!paths.length) return out;
    // Previews are decoration: a failure here must not hide the library.
    const { data } = await thumbs().createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl && !entry.error) out.set(entry.path, entry.signedUrl);
    }
    return out;
  }

  async function withSignedThumb(row: CreationRow): Promise<Creation> {
    const url = row.thumbnail_path ? (await signed([row.thumbnail_path]).catch(() => new Map<string, string>())).get(row.thumbnail_path) : null;
    return toCreation(row, url ?? null);
  }

  /**
   * Store (or clear) a creation's render and point the row at it. Best effort:
   * returns the row as it stands and the URL to show, never throws.
   */
  async function writeThumb(row: CreationRow, dataUrl: string | null): Promise<{ row: CreationRow; url: string | null }> {
    const path = thumbPath(row.id);
    try {
      const blob = dataUrl ? await thumbnailBlob(dataUrl) : null;
      if (!blob) {
        if (row.thumbnail_path) await thumbs().remove([row.thumbnail_path]);
        if (!row.thumbnail_path) return { row, url: null };
        const { data } = await client.from("creations").update({ thumbnail_path: null }).eq("id", row.id).select().single();
        return { row: data ?? { ...row, thumbnail_path: null }, url: null };
      }
      const { error } = await thumbs().upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
      if (error) return { row, url: null };
      if (row.thumbnail_path === path) return { row, url: dataUrl };
      const { data } = await client.from("creations").update({ thumbnail_path: path }).eq("id", row.id).select().single();
      return { row: data ?? row, url: data ? dataUrl : null };
    } catch {
      return { row, url: null };
    }
  }

  return {
    creations: {
      async list() {
        const { data, error } = await client.from("creations").select("*").order("updated_at", { ascending: false });
        if (error) throw storeError(error);
        const urls = await signed(data.flatMap((r) => (r.thumbnail_path ? [r.thumbnail_path] : []))).catch(() => new Map<string, string>());
        return data.map((r) => toCreation(r, r.thumbnail_path ? (urls.get(r.thumbnail_path) ?? null) : null));
      },

      async create(input: CreationInput) {
        const details = checkDetails(input);
        const scene = sanitizeScene(input.scene);
        const stats = sceneStats(scene.pieces);
        const { data, error } = await client
          .from("creations")
          .insert({
            ...details,
            scene_data: scene as unknown as Json,
            estimated_price_minor: stats.estimatedPriceMinor,
            currency: stats.currency,
            last_opened_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (error) throw storeError(error);
        const { row, url } = await writeThumb(data, input.thumbnail);
        return toCreation(row, url);
      },

      async update(id: string, patch: CreationPatch) {
        let current: CreationRow | null = null;
        const load = async () => {
          if (current) return current;
          const { data, error } = await client.from("creations").select("*").eq("id", id).single();
          if (error) throw storeError(error);
          current = data;
          return data;
        };

        const changes: Partial<CreationRow> = {};
        if (hasDetails(patch)) {
          const row = await load();
          Object.assign(
            changes,
            checkDetails({
              name: patch.name ?? row.name,
              description: patch.description ?? row.description,
              tags: patch.tags ?? row.tags,
            }),
          );
        }
        if (patch.scene) {
          const scene = sanitizeScene(patch.scene);
          const stats = sceneStats(scene.pieces);
          changes.scene_data = scene as unknown as Json;
          changes.estimated_price_minor = stats.estimatedPriceMinor;
          changes.currency = stats.currency;
        }
        if (patch.isFavorite !== undefined) changes.is_favorite = patch.isFavorite;
        if (patch.lastOpenedAt) changes.last_opened_at = patch.lastOpenedAt;

        let row: CreationRow;
        if (Object.keys(changes).length) {
          const { data, error } = await client.from("creations").update(changes).eq("id", id).select().single();
          if (error) throw storeError(error);
          row = data;
        } else {
          row = await load();
        }

        if (patch.thumbnail !== undefined) {
          const written = await writeThumb(row, patch.thumbnail);
          return toCreation(written.row, written.url);
        }
        return withSignedThumb(row);
      },

      async duplicate(id: string, name: string) {
        const { data: source, error: readError } = await client.from("creations").select("*").eq("id", id).single();
        if (readError) throw storeError(readError);
        const details = checkDetails({ ...source, name });
        const { data, error } = await client
          .from("creations")
          .insert({
            ...details,
            scene_data: source.scene_data,
            estimated_price_minor: source.estimated_price_minor,
            currency: source.currency,
          })
          .select()
          .single();
        if (error) throw storeError(error);
        if (!source.thumbnail_path) return toCreation(data, null);
        // The copy gets its own render file, so deleting either one leaves the other intact.
        try {
          const { error: copyError } = await thumbs().copy(source.thumbnail_path, thumbPath(data.id));
          if (copyError) return toCreation(data, null);
          const { data: linked } = await client
            .from("creations")
            .update({ thumbnail_path: thumbPath(data.id) })
            .eq("id", data.id)
            .select()
            .single();
          return withSignedThumb(linked ?? data);
        } catch {
          return toCreation(data, null);
        }
      },

      async remove(id: string) {
        const { data, error } = await client.from("creations").delete().eq("id", id).select("id, thumbnail_path");
        if (error) throw storeError(error);
        if (!data.length) throw new StudioStoreError("notFound");
        const path = data[0].thumbnail_path;
        // An orphaned image is harmless and private; the design is already gone.
        if (path) await thumbs().remove([path]).catch(() => undefined);
      },
    },

    groups: {
      async list() {
        const { data, error } = await client.from("gem_groups").select("*").order("updated_at", { ascending: false });
        if (error) throw storeError(error);
        return data.flatMap((r) => toGroup(r) ?? []);
      },

      async create(input: GemGroupInput) {
        const details = checkDetails(input);
        const groupData = sanitizeGroupData(input.data);
        if (!groupData) throw new StudioStoreError("invalid", "groupTooSmall");
        const { data, error } = await client
          .from("gem_groups")
          .insert({
            ...details,
            group_data: groupData as unknown as Json,
            estimated_price_minor: groupEstimateCents(groupData.pieces),
            currency: ESTIMATE_PRICING.currency,
          })
          .select()
          .single();
        if (error) throw storeError(error);
        const group = toGroup(data);
        if (!group) throw new StudioStoreError("invalid");
        return group;
      },

      async update(id: string, patch: GemGroupPatch) {
        const changes: Partial<GroupRow> = {};
        if (hasDetails(patch)) {
          const { data: row, error } = await client.from("gem_groups").select("name, description, tags").eq("id", id).single();
          if (error) throw storeError(error);
          Object.assign(
            changes,
            checkDetails({
              name: patch.name ?? row.name,
              description: patch.description ?? row.description,
              tags: patch.tags ?? row.tags,
            }),
          );
        }
        if (patch.isFavorite !== undefined) changes.is_favorite = patch.isFavorite;
        if (patch.lastUsedAt) changes.last_used_at = patch.lastUsedAt;
        const query = Object.keys(changes).length
          ? client.from("gem_groups").update(changes).eq("id", id).select().single()
          : client.from("gem_groups").select("*").eq("id", id).single();
        const { data, error } = await query;
        if (error) throw storeError(error);
        const group = toGroup(data);
        if (!group) throw new StudioStoreError("invalid");
        return group;
      },

      async duplicate(id: string, name: string) {
        const { data: source, error: readError } = await client.from("gem_groups").select("*").eq("id", id).single();
        if (readError) throw storeError(readError);
        const details = checkDetails({ ...source, name });
        const { data, error } = await client
          .from("gem_groups")
          .insert({
            ...details,
            group_data: source.group_data,
            estimated_price_minor: source.estimated_price_minor,
            currency: source.currency,
          })
          .select()
          .single();
        if (error) throw storeError(error);
        const group = toGroup(data);
        if (!group) throw new StudioStoreError("invalid");
        return group;
      },

      async remove(id: string) {
        const { data, error } = await client.from("gem_groups").delete().eq("id", id).select("id");
        if (error) throw storeError(error);
        if (!data.length) throw new StudioStoreError("notFound");
      },
    },

    feedback: {
      async submit(input: FeedbackInput) {
        const problem = validateFeedback(input);
        if (problem) throw new StudioStoreError("invalid", problem);
        const { error } = await client.from("studio_feedback").insert({
          rating: input.rating,
          category: input.category,
          message: input.message.trim(),
          context: input.context as unknown as Json,
        });
        if (error) throw storeError(error);
      },
    },
  };
}
