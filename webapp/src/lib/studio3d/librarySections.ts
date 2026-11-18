import type { GemShape } from "../../data/products";
import type { StudioGem } from "./gemCatalog";

/**
 * The editor library's sections: the shop's gems grouped by cut (the shop's
 * shape) and, for gems without one (the 18ct charms), by family. Each section
 * doubles as a filter in the shape picker. Pure, so the grouping, the search and the filter
 * are tested apart from the panel (`librarySections.test.ts`).
 */

export interface LibrarySection {
  /** `shape-<shape>` or `family-<family>` (`family-other` without one). */
  id: string;
  label: string;
  byShape: boolean;
  /** The shop's cut, drawn by the shop's own glyph; `null` for a family of charms. */
  shape: GemShape | null;
  /** The section's gems matching the search, in catalogue order. */
  items: StudioGem[];
}

export interface LibraryLabels {
  shape: (shape: string) => string;
  family: (family: string) => string;
  other: string;
  gemName: (gem: StudioGem) => string;
}

function sectionIdOf(gem: StudioGem): string {
  return gem.shopShape !== null ? `shape-${gem.shopShape}` : `family-${gem.family ?? "other"}`;
}

/**
 * Every section holding at least one gem that matches `query` (on the gem's
 * name or its section's name, ignoring case): cuts first, alphabetically,
 * then the families of charms.
 */
export function librarySections(
  gems: readonly StudioGem[],
  labels: LibraryLabels,
  query: string,
  /** Colour filter (`gem_colors.slug`): only gems of that colour; null = every colour. */
  color: string | null = null,
): LibrarySection[] {
  const q = query.trim().toLocaleLowerCase();
  const byId = new Map<string, LibrarySection>();
  for (const gem of gems) {
    if (color && gem.colorSlug !== color) continue;
    const id = sectionIdOf(gem);
    let section = byId.get(id);
    if (!section) {
      const byShape = gem.shopShape !== null;
      const label = byShape ? labels.shape(gem.shopShape!) : gem.family ? labels.family(gem.family) : labels.other;
      section = { id, label, byShape, shape: gem.shopShape, items: [] };
      byId.set(id, section);
    }
    if (!q || labels.gemName(gem).toLocaleLowerCase().includes(q) || section.label.toLocaleLowerCase().includes(q)) section.items.push(gem);
  }
  return [...byId.values()]
    .filter((s) => s.items.length)
    .sort((a, b) => Number(b.byShape) - Number(a.byShape) || a.label.localeCompare(b.label));
}

/**
 * The colours of the gems in `sections`, in the shop's colour order, with how
 * many gems each holds. Fed with the sections as the search and the cut leave
 * them (not narrowed by a colour), so every colour of the combo stays visible.
 */
export function colorCounts<T extends { slug: string }>(sections: readonly LibrarySection[], colors: readonly T[]): { color: T; count: number }[] {
  const counts = new Map<string, number>();
  for (const section of sections)
    for (const gem of section.items) if (gem.colorSlug) counts.set(gem.colorSlug, (counts.get(gem.colorSlug) ?? 0) + 1);
  return colors.filter((c) => counts.has(c.slug)).map((c) => ({ color: c, count: counts.get(c.slug)! }));
}

/** The sections a chip leaves on screen: all of them, or the chosen one. */
export function filterSections(sections: readonly LibrarySection[], chosen: string | null): readonly LibrarySection[] {
  return chosen ? sections.filter((s) => s.id === chosen) : sections;
}
