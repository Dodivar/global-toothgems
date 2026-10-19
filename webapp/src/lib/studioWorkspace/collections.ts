import type { Tables } from "../supabase/database.types";
import { studioSectionPath } from "../studioUrl";
import { COLLECTION_COLORS, type CollectionColor, type CollectionMembership, type StudioCollection } from "./types";

/**
 * Collections of saved creations: the row ↔ interface mapping and the pure
 * rules the library needs (which creations a collection holds, how many).
 * Membership stays a separate list (many-to-many), so the creations
 * themselves never carry it.
 */

type CollectionRow = Tables<"studio_collections">;
type MembershipRow = Tables<"studio_collection_creations">;

export function toCollectionColor(value: unknown): CollectionColor | null {
  return COLLECTION_COLORS.includes(value as CollectionColor) ? (value as CollectionColor) : null;
}

export function toCollection(row: CollectionRow): StudioCollection {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: toCollectionColor(row.color),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toMembership(row: Pick<MembershipRow, "collection_id" | "creation_id">): CollectionMembership {
  return { collectionId: row.collection_id, creationId: row.creation_id };
}

/** Alphabetical, in the UI language: the order the library lists them in. */
export function sortCollections(list: StudioCollection[], locale?: string): StudioCollection[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" }));
}

/** The creations of one collection. */
export function creationIdsIn(collectionId: string, memberships: CollectionMembership[]): Set<string> {
  return new Set(memberships.filter((m) => m.collectionId === collectionId).map((m) => m.creationId));
}

/** The collections one creation sits in. */
export function collectionIdsOf(creationId: string, memberships: CollectionMembership[]): Set<string> {
  return new Set(memberships.filter((m) => m.creationId === creationId).map((m) => m.collectionId));
}

/**
 * How many of the given creations each collection holds. Only creations that
 * are in the list count, so a membership the library has not loaded (or one
 * whose creation was just deleted) never inflates the figure.
 */
export function collectionCounts(
  collections: StudioCollection[],
  memberships: CollectionMembership[],
  creationIds: Iterable<string>,
): Record<string, number> {
  const present = new Set(creationIds);
  const counts: Record<string, number> = Object.fromEntries(collections.map((c) => [c.id, 0]));
  for (const m of memberships) {
    if (m.collectionId in counts && present.has(m.creationId)) counts[m.collectionId] += 1;
  }
  return counts;
}

/** Memberships with the given ones added, without duplicates. */
export function withMemberships(list: CollectionMembership[], added: CollectionMembership[]): CollectionMembership[] {
  const key = (m: CollectionMembership) => `${m.collectionId}:${m.creationId}`;
  const seen = new Set(list.map(key));
  const out = [...list];
  for (const m of added) {
    if (seen.has(key(m))) continue;
    seen.add(key(m));
    out.push(m);
  }
  return out;
}

/** Memberships without the given creations in the given collection. */
export function withoutMemberships(list: CollectionMembership[], collectionId: string, creationIds: string[]): CollectionMembership[] {
  const out = new Set(creationIds);
  return list.filter((m) => !(m.collectionId === collectionId && out.has(m.creationId)));
}

/** "My Creations" narrowed to one collection: the address the library reads its filter from. */
export function studioCollectionPath(collectionId: string | null): string {
  const base = studioSectionPath("creations");
  return collectionId ? `${base}?${COLLECTION_PARAM}=${encodeURIComponent(collectionId)}` : base;
}

export const COLLECTION_PARAM = "collection";
