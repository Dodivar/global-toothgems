import { creationIdsIn, sortCollections } from "./collections";
import { matchesQuery, queryCreations, type CreationFilter, type CreationSort } from "./library";
import type { CollectionMembership, Creation, StudioCollection } from "./types";

/**
 * The explorer layout of "My Creations": the collections as folders, opened
 * to see the creations inside, and the creations filed nowhere beside them —
 * like a file explorer's top level. Pure, so the rules are tested once.
 *
 * Memberships are many-to-many, so a creation shows in every folder it sits
 * in; "loose" creations are those in no collection at all.
 */

/** How many creations a folder's cover shows. */
export const FOLDER_PREVIEWS = 4;

export interface ExplorerFolder {
  collection: StudioCollection;
  /** Creations in it that are in the library. */
  count: number;
  /** The most recently edited ones, for the folder's cover. */
  previews: Creation[];
}

export interface ExplorerRoot {
  folders: ExplorerFolder[];
  /** Not searching: the creations in no collection. Searching: every matching creation, wherever it is filed. */
  creations: Creation[];
  /** A search word or a filter chip is active: the top level lists results from the whole library. */
  searching: boolean;
}

interface ExplorerQuery {
  query: string;
  filter: CreationFilter;
  sort: CreationSort;
  locale?: string;
  now?: number;
}

export function explorerFolders(
  creations: Creation[],
  collections: StudioCollection[],
  memberships: CollectionMembership[],
  locale?: string,
): ExplorerFolder[] {
  const byRecent = [...creations].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return sortCollections(collections, locale).map((collection) => {
    const inside = creationIdsIn(collection.id, memberships);
    const held = byRecent.filter((c) => inside.has(c.id));
    return { collection, count: held.length, previews: held.slice(0, FOLDER_PREVIEWS) };
  });
}

/**
 * The top level. Without a search or filter: every folder, then the loose
 * creations. With one, the way a file explorer searches: the folders whose
 * name matches the words, and the matching creations from all folders, so a
 * design is found without knowing where it was filed.
 */
export function explorerRoot(
  creations: Creation[],
  collections: StudioCollection[],
  memberships: CollectionMembership[],
  opts: ExplorerQuery,
): ExplorerRoot {
  const searching = opts.query.trim() !== "" || opts.filter !== "all";
  const folders = explorerFolders(creations, collections, memberships, opts.locale);
  if (searching) {
    return {
      searching,
      folders: opts.query.trim()
        ? folders.filter((f) => matchesQuery({ name: f.collection.name, description: "" }, opts.query))
        : [],
      creations: queryCreations(creations, opts),
    };
  }
  const filed = new Set(memberships.map((m) => m.creationId));
  return { searching, folders, creations: queryCreations(creations.filter((c) => !filed.has(c.id)), opts) };
}

/** Inside one folder: its creations, with the search, filter and sort applied. */
export function explorerFolderContents(
  creations: Creation[],
  collectionId: string,
  memberships: CollectionMembership[],
  opts: ExplorerQuery,
): Creation[] {
  return queryCreations(creations, { ...opts, inCollection: creationIdsIn(collectionId, memberships) });
}
