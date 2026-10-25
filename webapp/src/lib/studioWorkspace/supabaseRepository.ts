import type { TypedSupabaseClient } from "../supabase/client";
import type { Json, Tables } from "../supabase/database.types";
import { BUCKETS, SIGNED_URL_TTL_SECONDS } from "../supabase/storage";
import { STUDIO_SHARE_PATH } from "../studioUrl";
import { toCollection, toMembership, toPreferences } from "./collections";
import { sanitizeGroupData } from "./gemGroup";
import { currentEstimate } from "../studio3d/gemRegistry";
import {
  StudioStoreError,
  type CollectionsRepository,
  type PreferencesRepository,
  type CreationInput,
  type CreationPatch,
  type GemGroupInput,
  type GemGroupPatch,
  type StudioRepositories,
} from "./repository";
import { sanitizeScene, sceneStats } from "./scene";
import { parseSharedCreation, SHARE_TOKEN_PATTERN, snapshotShareLink, storedShareLink, type SharedDesign } from "./share";
import type { CollectionDetails, Creation, FeedbackInput, GemGroup } from "./types";
import { normalizeCollection, normalizeDetails, validateCollection, validateDetails, validateFeedback } from "./validation";

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
 * (a Gem Group's to `<user id>/groups/<group id>.jpg`) and served by signed
 * URL. A failed upload leaves the card on its drawn preview.
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

export function storeError(error: PgError | null | undefined): StudioStoreError {
  switch (error?.code) {
    case "23514": // check violation
    case "23502":
    case "22P02":
    case "22023":
      return new StudioStoreError("invalid");
    case "42501": // a write refused by row-level security: no Studio access (trial over)
      return new StudioStoreError("accessDenied");
    case "23505": // unique violation: a collection of that name already exists
      return new StudioStoreError("duplicate");
    case "23503": // foreign key: the collection or the creation is gone (or not ours)
    case "PGRST116": // no row (or not ours: RLS hides it)
    case "P0002": // raised by the share functions for a creation that is not ours
      return new StudioStoreError("notFound");
  }
  // Storage reports its policy refusals by message only.
  if (/row-level security/i.test(error?.message ?? "")) return new StudioStoreError("accessDenied");
  if (/failed to fetch|network/i.test(error?.message ?? "")) return new StudioStoreError("unavailable");
  return new StudioStoreError("storage");
}

function checkCollection(details: CollectionDetails): CollectionDetails {
  const problem = validateCollection(details);
  if (problem) throw new StudioStoreError("invalid", problem);
  return normalizeCollection(details);
}

/**
 * Collections and their memberships. Owner and timestamps are the database's;
 * RLS keeps every query to the member's rows and refuses linking anything
 * that is not theirs.
 */
function collectionsRepository(client: TypedSupabaseClient): CollectionsRepository {
  return {
    async list() {
      const [collections, memberships] = await Promise.all([
        client.from("studio_collections").select("*").order("name"),
        client.from("studio_collection_creations").select("collection_id, creation_id"),
      ]);
      if (collections.error) throw storeError(collections.error);
      if (memberships.error) throw storeError(memberships.error);
      return { collections: collections.data.map(toCollection), memberships: memberships.data.map(toMembership) };
    },

    async create(details) {
      const { data, error } = await client.from("studio_collections").insert(checkCollection(details)).select().single();
      if (error) throw storeError(error);
      return toCollection(data);
    },

    async update(id, details) {
      const { data, error } = await client.from("studio_collections").update(checkCollection(details)).eq("id", id).select().single();
      if (error) throw storeError(error);
      return toCollection(data);
    },

    async remove(id) {
      // The memberships go with it (cascade); the creations stay.
      const { data, error } = await client.from("studio_collections").delete().eq("id", id).select("id");
      if (error) throw storeError(error);
      if (!data.length) throw new StudioStoreError("notFound");
    },

    async addCreations(collectionId, creationIds) {
      if (!creationIds.length) return;
      const rows = creationIds.map((creation_id) => ({ collection_id: collectionId, creation_id }));
      const { error } = await client
        .from("studio_collection_creations")
        .upsert(rows, { onConflict: "collection_id,creation_id", ignoreDuplicates: true });
      if (error) throw storeError(error);
    },

    async removeCreations(collectionId, creationIds) {
      if (!creationIds.length) return;
      const { error } = await client
        .from("studio_collection_creations")
        .delete()
        .eq("collection_id", collectionId)
        .in("creation_id", creationIds);
      if (error) throw storeError(error);
    },
  };
}

/** The member's single preferences row (`studio_preferences`), written by upsert. */
function preferencesRepository(client: TypedSupabaseClient): PreferencesRepository {
  return {
    async get() {
      const { data, error } = await client.from("studio_preferences").select("library_view").maybeSingle();
      if (error) throw storeError(error);
      return toPreferences(data);
    },
    async update(patch) {
      const { data, error } = await client
        .from("studio_preferences")
        .upsert({ library_view: toPreferences({ library_view: patch.libraryView }).libraryView }, { onConflict: "user_id" })
        .select("library_view")
        .single();
      if (error) throw storeError(error);
      return toPreferences(data);
    },
  };
}

function checkDetails(details: { name: string; description: string }) {
  const problem = validateDetails(details);
  if (problem) throw new StudioStoreError("invalid", problem);
  return normalizeDetails(details);
}

/**
 * The share table and its functions (`…_studio_creation_shares.sql`) are not
 * in this database yet: PostgREST cannot find them. Sharing then falls back to
 * snapshot links, exactly as before stored links existed.
 */
const shareSchemaMissing = (error: PgError | null | undefined) =>
  !!error && ["PGRST202", "PGRST205", "42P01", "42883"].includes(error.code ?? "");

const hasDetails = (p: { name?: string; description?: string }) =>
  p.name !== undefined || p.description !== undefined;

export function toCreation(row: CreationRow, thumbnailUrl: string | null): Creation {
  const scene = sanitizeScene(row.scene_data);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    scene,
    // The count follows the scene as read back, so the card never disagrees with
    // it; the estimate is the one stored at the last save (shop prices then).
    elementCount: scene.pieces.length,
    estimatedPriceMinor: row.estimated_price_minor,
    currency: row.currency,
    thumbnailUrl,
    isFavorite: row.is_favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    templatePublishedAt: row.template_published_at,
  };
}

function toGroup(row: GroupRow, thumbnailUrl: string | null): GemGroup | null {
  const data = sanitizeGroupData(row.group_data);
  if (!data) return null;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description,
    data,
    thumbnailUrl,
    elementCount: data.pieces.length,
    estimatedPriceMinor: row.estimated_price_minor,
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
  const groupThumbPath = (groupId: string) => `${userId}/groups/${groupId}.jpg`;
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

  async function withSignedGroupThumb(row: GroupRow): Promise<GemGroup | null> {
    const url = row.thumbnail_path ? (await signed([row.thumbnail_path]).catch(() => new Map<string, string>())).get(row.thumbnail_path) : null;
    return toGroup(row, url ?? null);
  }

  /**
   * Store a new group's render and point the row at it. Best effort, like the
   * creations': returns the row as it stands and the URL to show, never throws.
   * A group's arrangement never changes after it is made, so neither does its render.
   */
  async function writeGroupThumb(row: GroupRow, dataUrl: string | null): Promise<{ row: GroupRow; url: string | null }> {
    try {
      const blob = dataUrl ? await thumbnailBlob(dataUrl) : null;
      if (!blob) return { row, url: null };
      const path = groupThumbPath(row.id);
      const { error } = await thumbs().upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
      if (error) return { row, url: null };
      const { data } = await client.from("gem_groups").update({ thumbnail_path: path }).eq("id", row.id).select().single();
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

      async shareLink(creation: Creation) {
        const { data, error } = await client.rpc("studio_share_creation", { p_creation_id: creation.id });
        if (shareSchemaMissing(error)) return snapshotShareLink(creation, STUDIO_SHARE_PATH);
        if (error) throw storeError(error);
        if (typeof data !== "string" || !SHARE_TOKEN_PATTERN.test(data)) throw new StudioStoreError("storage");
        return storedShareLink(data, STUDIO_SHARE_PATH);
      },

      async existingShareLink(creation: Creation) {
        // RLS: only the owner's own links are visible.
        const { data, error } = await client
          .from("creation_shares")
          .select("token")
          .eq("creation_id", creation.id)
          .is("revoked_at", null)
          .maybeSingle();
        if (shareSchemaMissing(error)) return snapshotShareLink(creation, STUDIO_SHARE_PATH);
        if (error) throw storeError(error);
        return data && SHARE_TOKEN_PATTERN.test(data.token) ? storedShareLink(data.token, STUDIO_SHARE_PATH) : null;
      },

      async revokeShare(id: string) {
        const { error } = await client.rpc("studio_revoke_creation_share", { p_creation_id: id });
        if (error) throw storeError(error);
      },
    },

    groups: {
      async list() {
        const { data, error } = await client.from("gem_groups").select("*").order("updated_at", { ascending: false });
        if (error) throw storeError(error);
        const urls = await signed(data.flatMap((r) => (r.thumbnail_path ? [r.thumbnail_path] : []))).catch(() => new Map<string, string>());
        return data.flatMap((r) => toGroup(r, r.thumbnail_path ? (urls.get(r.thumbnail_path) ?? null) : null) ?? []);
      },

      async create(input: GemGroupInput) {
        const details = checkDetails(input);
        const groupData = sanitizeGroupData(input.data);
        if (!groupData) throw new StudioStoreError("invalid", "groupTooSmall");
        const groupEstimate = currentEstimate(groupData.pieces);
        const { data, error } = await client
          .from("gem_groups")
          .insert({
            ...details,
            group_data: groupData as unknown as Json,
            estimated_price_minor: groupEstimate.totalMinor,
            currency: groupEstimate.currency,
          })
          .select()
          .single();
        if (error) throw storeError(error);
        const { row, url } = await writeGroupThumb(data, input.thumbnail);
        const group = toGroup(row, url);
        if (!group) throw new StudioStoreError("invalid");
        return group;
      },

      async update(id: string, patch: GemGroupPatch) {
        const changes: Partial<GroupRow> = {};
        if (hasDetails(patch)) {
          const { data: row, error } = await client.from("gem_groups").select("name, description").eq("id", id).single();
          if (error) throw storeError(error);
          Object.assign(
            changes,
            checkDetails({
              name: patch.name ?? row.name,
              description: patch.description ?? row.description,
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
        const group = await withSignedGroupThumb(data);
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
        if (!source.thumbnail_path) {
          const group = toGroup(data, null);
          if (!group) throw new StudioStoreError("invalid");
          return group;
        }
        // The copy gets its own render file, so deleting either one leaves the other intact.
        let row = data;
        try {
          const { error: copyError } = await thumbs().copy(source.thumbnail_path, groupThumbPath(data.id));
          if (!copyError) {
            const { data: linked } = await client
              .from("gem_groups")
              .update({ thumbnail_path: groupThumbPath(data.id) })
              .eq("id", data.id)
              .select()
              .single();
            row = linked ?? data;
          }
        } catch {
          /* the copy keeps its drawn preview */
        }
        const group = await withSignedGroupThumb(row);
        if (!group) throw new StudioStoreError("invalid");
        return group;
      },

      async remove(id: string) {
        const { data, error } = await client.from("gem_groups").delete().eq("id", id).select("id, thumbnail_path");
        if (error) throw storeError(error);
        if (!data.length) throw new StudioStoreError("notFound");
        const path = data[0].thumbnail_path;
        // An orphaned image is harmless and private; the group is already gone.
        if (path) await thumbs().remove([path]).catch(() => undefined);
      },
    },

    collections: collectionsRepository(client),
    preferences: preferencesRepository(client),

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

/**
 * The creation behind a stored share link, for anyone who has the link,
 * signed in or not. Read through `studio_shared_creation`, the only way in for
 * a guest: it returns the name, description and scene of that one creation
 * and nothing about its owner. Null for an unknown or disabled link; throws
 * when the database cannot be reached, so the page can tell the two apart.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One creation of a public Glowbook, for the read-only 3D viewer (decision 99):
 * `studio_public_showcase_creation(handle, item)` answers only for an approved
 * creation of an approved Glowbook whose author has Studio access; null otherwise.
 */
export async function fetchGlowbookCreation(
  client: TypedSupabaseClient,
  handle: string,
  itemId: string,
): Promise<{ design: SharedDesign; author: { handle: string; displayName: string }; tryOn: boolean } | null> {
  if (!UUID_PATTERN.test(itemId) || !/^[a-z0-9._-]{3,30}$/i.test(handle)) return null;
  const { data, error } = await client.rpc("studio_public_showcase_creation", { p_handle: handle.toLowerCase(), p_item_id: itemId });
  if (error) throw storeError(error);
  const design = parseSharedCreation(data);
  if (!design || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as Record<string, unknown>;
  return {
    design,
    author: { handle: String(row.handle ?? handle), displayName: typeof row.display_name === "string" ? row.display_name : "" },
    tryOn: row.try_on === true,
  };
}

/** A shared creation, and whether its owner's plan lets it be tried on a photo with AI (decision 111). */
export async function fetchSharedCreation(client: TypedSupabaseClient, token: string): Promise<{ design: SharedDesign; tryOn: boolean } | null> {
  if (!SHARE_TOKEN_PATTERN.test(token)) return null;
  const { data, error } = await client.rpc("studio_shared_creation", { p_token: token });
  if (shareSchemaMissing(error)) return null;
  if (error) throw storeError(error);
  const row = Array.isArray(data) ? data[0] : null;
  const design = parseSharedCreation(row);
  return design ? { design, tryOn: row?.try_on === true } : null;
}
