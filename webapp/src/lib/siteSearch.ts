import type { Product } from "../data/products";
import type { ShopCategoryDef } from "../data/taxonomy";
import { pick } from "../data/types";
import type { PublicCourse } from "./academy/publicCourse";
import { courseSlug } from "./academy/publicCourse";
import { courseHref } from "./academyUrl";
import { publicRoute, type Locale, type PublicRouteId } from "./localeRoutes";
import { pageText } from "./pageMeta";

/**
 * The header's search: products, courses and informational pages matching
 * what the customer types.
 *
 * It searches what the storefront already holds rather than asking the
 * database again: the catalogue (`CatalogProvider`: active products only) and
 * the published courses (`AcademyProvider`) are loaded once per visit under
 * RLS, and the pages' headings and introductions are the ones their `<head>`
 * uses (`pageMeta.ts`). So nothing the visitor may not read can come out of
 * it, and a keystroke costs no request. When the catalogue outgrows a
 * client-side list (see `CatalogProvider`), this becomes a database query.
 *
 * Both languages are searched, as in the back office's filters: typing the
 * English name while reading in French is normal on a bilingual shop.
 */

export type SearchKind = "product" | "course" | "page";

export interface SearchHit {
  kind: SearchKind;
  key: string;
  title: string;
  /** Short context under the title (subtitle, theme, introduction). */
  detail?: string;
  /** Internal path, for `lib/navigation`. */
  to: string;
  image?: string;
}

export interface SearchResults {
  products: SearchHit[];
  courses: SearchHit[];
  pages: SearchHit[];
}

/** Per group, so the panel stays a dropdown rather than a results page. */
export const SEARCH_LIMITS: Record<SearchKind, number> = { product: 5, course: 3, page: 4 };
/** One character matches nearly everything; the panel waits for a second. */
export const MIN_QUERY_LENGTH = 2;

/** The informational pages offered, in the order they win a tie. */
export const SEARCHABLE_PAGES: readonly PublicRouteId[] = [
  "help",
  "faq",
  "contact",
  "shipping",
  "returns",
  "legalNotice",
  "terms",
  "termsOfUse",
  "privacy",
  "cookies",
  "about",
  "loyalty",
  "giftCard",
  "shapes",
  "colours",
  "studio",
];

/** Ignores case and accents, so "etoile" finds "Étoile" ("œ" does not decompose under NFD). */
export function normalizeQuery(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    // Punctuation separates words: "2.0mm" or "anti-reflet" still match from a word's start.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The help pages' inline markup (`data/legal/types.ts`) as plain text. */
function plain(text: string): string {
  return text
    .replace(/<<([^|>]*)\|[^>]*>>/g, "$1")
    .replace(/\[\[!?([^\]]*)\]\]/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How well `title` (the name) and `extra` (everything else) match the query,
 * 0 for no match. Every word typed must appear somewhere; the name matching
 * exactly, then from its start, then at a word's start ranks above a match
 * buried in a description.
 */
export function scoreMatch(query: string, title: readonly string[], extra: readonly string[]): number {
  const needle = normalizeQuery(query);
  if (!needle) return 0;
  const names = title.map(normalizeQuery).filter(Boolean);
  const others = extra.map(normalizeQuery).filter(Boolean);
  const words = needle.split(" ");
  // Inside a name any part of a word matches ("solit" finds "Solitaire"); in
  // the longer texts only a word's start does, or "or" would find "pour".
  const inName = (word: string) => names.some((name) => name.includes(word));
  const atWordStart = (text: string, word: string) => ` ${text}`.includes(` ${word}`);
  if (!words.every((word) => inName(word) || others.some((other) => atWordStart(other, word)))) return 0;

  let score = 1;
  for (const name of names) {
    if (name === needle) score = Math.max(score, 100);
    else if (name.startsWith(needle)) score = Math.max(score, 80);
    else if (atWordStart(name, needle)) score = Math.max(score, 60);
    else if (name.includes(needle)) score = Math.max(score, 40);
  }
  for (const word of words) {
    if (names.some((name) => atWordStart(name, word))) score += 10;
    else if (inName(word)) score += 5;
    else score += 2;
  }
  return score;
}

function top(scored: { hit: SearchHit; score: number }[], limit: number): SearchHit[] {
  // Array.prototype.sort is stable: ties keep the source order (newest products, course order, page list).
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.hit);
}

const both = (value: { fr: string; en: string } | null | undefined): string[] => (value ? [value.fr, value.en] : []);

export function searchProducts(
  products: readonly Product[],
  taxonomy: readonly ShopCategoryDef[],
  query: string,
  lang: string,
  limit = SEARCH_LIMITS.product,
): SearchHit[] {
  const categories = new Map(taxonomy.map((category) => [category.slug, category]));
  return top(
    products.map((product) => {
      const category = product.cat ? categories.get(product.cat) : undefined;
      const family = category?.families.find((f) => f.slug === product.family);
      const score = scoreMatch(
        query,
        both(product.name),
        [
          ...both(product.subtitle),
          // The family is the brand for the gems (Swarovski, Preciosa…).
          ...both(family?.name),
          ...both(category?.name),
          product.material,
          ...both(product.center),
          // Not the long description: its care and returns wording made "retour"
          // or "hygiène" list gems instead of the pages about them.
          ...(product.variants ?? []).flatMap((variant) => both(variant.name)),
        ],
      );
      return {
        score,
        hit: {
          kind: "product" as const,
          key: product.id,
          title: pick(product.name, lang),
          detail: pick(product.subtitle, lang) || undefined,
          to: `/boutique/${product.id}`,
          image: product.image,
        },
      };
    }),
    limit,
  );
}

export function searchCourses(
  courses: readonly PublicCourse[],
  query: string,
  lang: string,
  /** The course's theme, as the catalogue names it. */
  categoryLabel: (course: PublicCourse) => string,
  limit = SEARCH_LIMITS.course,
): SearchHit[] {
  const locale: Locale = lang.startsWith("en") ? "en" : "fr";
  return top(
    courses.map((course) => ({
      score: scoreMatch(query, both(course.title), [
        ...both(course.summary),
        ...both(course.description),
        categoryLabel(course),
        ...course.objectives.flatMap(both),
        ...course.modules.flatMap((module) => both(module.title)),
      ]),
      hit: {
        kind: "course" as const,
        key: course.id,
        title: pick(course.title, lang),
        detail: course.summary ? pick(course.summary, lang) : categoryLabel(course),
        to: courseHref(courseSlug(course, locale)),
        image: course.cover?.src,
      },
    })),
    limit,
  );
}

export function searchPages(query: string, lang: string, limit = SEARCH_LIMITS.page): SearchHit[] {
  const locale: Locale = lang.startsWith("en") ? "en" : "fr";
  const other: Locale = locale === "fr" ? "en" : "fr";
  return top(
    SEARCHABLE_PAGES.flatMap((id) => {
      const text = pageText(id, locale);
      if (!text) return [];
      const alt = pageText(id, other);
      return [
        {
          score: scoreMatch(query, [text.title, alt?.title ?? ""], [plain(text.description ?? ""), plain(alt?.description ?? "")]),
          hit: {
            kind: "page" as const,
            key: id,
            title: text.title,
            detail: text.description ? plain(text.description) : undefined,
            to: publicRoute(id).fr,
          },
        },
      ];
    }),
    limit,
  );
}

export function isEmptyResults(results: SearchResults): boolean {
  return results.products.length + results.courses.length + results.pages.length === 0;
}
