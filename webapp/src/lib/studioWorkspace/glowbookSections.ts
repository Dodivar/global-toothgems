import type { Database } from "../supabase/database.types";

/**
 * Glowbook sections ("Mariage", "Minimaliste"…) and the certified-artist
 * badge (decision 102). Pure: the rules the database enforces (repeated so
 * the form can say what is wrong first), row ↔ UI mapping, ordering, and
 * what the public page shows under a section filter.
 *
 * An artist files each Glowbook creation in at most one section, or none.
 * The public page lists only the sections holding an approved creation
 * (the database decides) and always shows the creations without a section.
 * Sections follow the plan switch (`private.glowbook_customization_allowed`);
 * the badge does not: it is derived by the database from the Academy courses
 * the artist completed with a certificate.
 */

export interface GlowbookSection {
  id: string;
  name: string;
  position: number;
}

export const SECTION_NAME_MAX = 40;
export const GLOWBOOK_MAX_SECTIONS = 12;

/** As the database stores it: trimmed, inner runs of spaces collapsed. */
export const normalizeSectionName = (raw: string) => raw.trim().replace(/\s+/g, " ");

export type SectionProblem = "required" | "length" | "taken" | "full";

/**
 * The first problem with a section name, or null. `selfId` is the section
 * being renamed (its own name is not a duplicate). Names are unique per
 * Glowbook, whatever the case.
 */
export function validateSectionName(raw: string, sections: readonly GlowbookSection[], selfId: string | null = null): SectionProblem | null {
  const name = normalizeSectionName(raw);
  if (!name) return "required";
  if (name.length > SECTION_NAME_MAX) return "length";
  const lower = name.toLowerCase();
  if (sections.some((s) => s.id !== selfId && s.name.toLowerCase() === lower)) return "taken";
  if (selfId === null && sections.length >= GLOWBOOK_MAX_SECTIONS) return "full";
  return null;
}

type SectionRow = Database["public"]["Tables"]["studio_showcase_sections"]["Row"];

export const toGlowbookSection = (row: SectionRow): GlowbookSection => ({ id: row.id, name: row.name, position: row.position });

export const sortSections = (sections: readonly GlowbookSection[]) =>
  [...sections].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

/** Moves one section up (-1) or down (+1); the new order of section ids. */
export function moveSection(sections: readonly GlowbookSection[], id: string, delta: -1 | 1): string[] {
  const ids = sortSections(sections).map((s) => s.id);
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

/** How many creations each section holds (by section id). */
export function sectionCounts(items: readonly { sectionId: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) if (item.sectionId) counts.set(item.sectionId, (counts.get(item.sectionId) ?? 0) + 1);
  return counts;
}

/* ------------------------------------------------------------ public page */

/** "all", or the id of the section the visitor picked. */
export type SectionFilter = "all" | (string & {});

/**
 * What the public page shows: under "all", the spotlight creation first and
 * every other creation; under a section, that section's creations only, in
 * the artist's order (the spotlight is a place on the page, not a section).
 * A filter naming no known section falls back to "all".
 */
export function visibleCreations<T extends { id: string; sectionId: string | null }>(
  items: readonly T[],
  sections: readonly { id: string }[],
  featuredId: string | null,
  filter: SectionFilter,
): { featured: T | undefined; others: T[]; filter: SectionFilter } {
  const active: SectionFilter = filter !== "all" && sections.some((s) => s.id === filter) ? filter : "all";
  if (active !== "all") return { featured: undefined, others: items.filter((i) => i.sectionId === active), filter: active };
  const featured = featuredId ? items.find((i) => i.id === featuredId) : undefined;
  return { featured, others: featured ? items.filter((i) => i.id !== featured.id) : [...items], filter: "all" };
}

/** `studio_public_showcase()`'s `sections`, read defensively. */
export function toPublicSections(json: unknown): { id: string; name: string }[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const o = raw as Record<string, unknown>;
    return typeof o.id === "string" && o.id && typeof o.name === "string" && o.name ? [{ id: o.id, name: o.name }] : [];
  });
}

/* ------------------------------------------------------------------ badge */

/** A course the artist completed with a certificate: its title in French and English. */
export interface CertifiedCourse {
  fr: string;
  en: string;
}

/** `[{fr, en}]` (from `studio_my_certification()` or the public page's `certification.courses`), read defensively. */
export function toCertifiedCourses(json: unknown): CertifiedCourse[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const o = raw as Record<string, unknown>;
    const fr = typeof o.fr === "string" ? o.fr.trim() : "";
    const en = typeof o.en === "string" ? o.en.trim() : "";
    return fr || en ? [{ fr: fr || en, en: en || fr }] : [];
  });
}

/** The course titles in the page's language, without repeats. */
export function certifiedTitles(courses: readonly CertifiedCourse[], lang: string): string[] {
  return [...new Set(courses.map((c) => (lang.startsWith("en") ? c.en : c.fr)))];
}
