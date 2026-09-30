import { isSymmetrical } from "./scene";
import type { Creation, GemGroup } from "./types";

/**
 * Search, filters and sort of the creative library. Pure, so the rules are
 * tested once and the page only wires them to its controls.
 */

export const CREATION_SORTS = ["updated", "created", "name", "price", "elements"] as const;
export type CreationSort = (typeof CREATION_SORTS)[number];

export const CREATION_FILTERS = ["all", "favorites", "minimal", "complex", "symmetrical", "withGroups", "recent"] as const;
export type CreationFilter = (typeof CREATION_FILTERS)[number];

/** At most this many pieces reads as "minimal"; at least `COMPLEX_FROM` as "complex". */
export const MINIMAL_UP_TO = 3;
export const COMPLEX_FROM = 8;
/** "Recently used": opened or edited within this many days. */
export const RECENT_DAYS = 7;
const DAY_MS = 86_400_000;

const fold = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Name, description or any tag contains every word of the query (accents and case ignored). */
export function matchesQuery(record: Pick<Creation, "name" | "description" | "tags">, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fold([record.name, record.description, ...record.tags].join(" "));
  return words.every((w) => haystack.includes(w));
}

export function matchesFilter(c: Creation, filter: CreationFilter, now = Date.now()): boolean {
  switch (filter) {
    case "all":
      return true;
    case "favorites":
      return c.isFavorite;
    case "minimal":
      return c.elementCount <= MINIMAL_UP_TO;
    case "complex":
      return c.elementCount >= COMPLEX_FROM;
    case "symmetrical":
      return isSymmetrical(c.scene.pieces);
    case "withGroups":
      return c.scene.groups.length > 0;
    case "recent": {
      const last = Math.max(Date.parse(c.updatedAt), c.lastOpenedAt ? Date.parse(c.lastOpenedAt) : 0);
      return now - last <= RECENT_DAYS * DAY_MS;
    }
  }
}

export function sortCreations(list: Creation[], sort: CreationSort, locale?: string): Creation[] {
  const byDateDesc = (a: string, b: string) => Date.parse(b) - Date.parse(a);
  const out = [...list];
  switch (sort) {
    case "updated":
      return out.sort((a, b) => byDateDesc(a.updatedAt, b.updatedAt));
    case "created":
      return out.sort((a, b) => byDateDesc(a.createdAt, b.createdAt));
    case "name":
      return out.sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: "base" }));
    case "price":
      return out.sort((a, b) => b.estimatedPriceMinor - a.estimatedPriceMinor || byDateDesc(a.updatedAt, b.updatedAt));
    case "elements":
      return out.sort((a, b) => b.elementCount - a.elementCount || byDateDesc(a.updatedAt, b.updatedAt));
  }
}

export function queryCreations(
  list: Creation[],
  opts: { query: string; filter: CreationFilter; sort: CreationSort; locale?: string; now?: number },
): Creation[] {
  return sortCreations(
    list.filter((c) => matchesQuery(c, opts.query) && matchesFilter(c, opts.filter, opts.now)),
    opts.sort,
    opts.locale,
  );
}

/** Groups: favourites first, then the most recently used or edited. */
export function queryGroups(list: GemGroup[], query: string): GemGroup[] {
  const last = (g: GemGroup) => Math.max(Date.parse(g.updatedAt), g.lastUsedAt ? Date.parse(g.lastUsedAt) : 0);
  return list
    .filter((g) => matchesQuery(g, query))
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || last(b) - last(a));
}

export interface StudioSummary {
  creations: number;
  groups: number;
  gemsUsed: number;
  /** Sum of the creations' estimates, in minor units. Informational only. */
  totalEstimateMinor: number;
}

export function summarize(creations: Creation[], groups: GemGroup[]): StudioSummary {
  return {
    creations: creations.length,
    groups: groups.length,
    gemsUsed: creations.reduce((n, c) => n + c.elementCount, 0),
    totalEstimateMinor: creations.reduce((n, c) => n + c.estimatedPriceMinor, 0),
  };
}
