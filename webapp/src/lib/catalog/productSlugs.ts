import type { Locale, ParamTranslator, PublicRouteId } from "../localeRoutes";

/**
 * Product addresses per language (decided 2026-09-30): `/fr/boutique/<French
 * slug>` and `/en/shop/<English slug>`. The French slug is `products.slug`
 * (the product's `id` in the storefront model); the English one is the
 * published `product_translations.slug`, falling back to the French slug when
 * there is none (the mock fixtures have none: both languages share their id).
 * Pure: shared by the server (metadata, redirects, sitemap) and the browser
 * (links, language switch).
 */

export interface SluggedProduct {
  /** French slug. */
  id: string;
  /** Row id in the database: an old kind of link, still resolved. */
  dbId?: string;
  /** Every other published slug of the product. */
  aliases?: string[];
  /** Published slug per language, when it differs from the French one. */
  slugs?: Partial<Record<Locale, string>>;
}

export function productSlug(product: SluggedProduct, locale: Locale): string {
  return (locale === "fr" ? undefined : product.slugs?.[locale]) ?? product.id;
}

/** The product a URL key names: its slug in any language, an older slug or its row id. */
export function findProductByKey<P extends SluggedProduct>(products: readonly P[], key: string): P | undefined {
  return (
    products.find((p) => p.id === key) ??
    products.find((p) => Object.values(p.slugs ?? {}).includes(key) || p.aliases?.includes(key) || p.dbId === key)
  );
}

/** Where a product address should point: the page, or the address it moved to. */
export type ProductAddress<P> = { kind: "found"; product: P } | { kind: "moved"; product: P; slug: string } | { kind: "unknown" };

/**
 * Resolves the slug of a product address in a language. A key that names a
 * product by another language's slug, an older slug or its row id is "moved"
 * (the server answers 308 to the right address); an unknown key is a 404.
 */
export function resolveProductAddress<P extends SluggedProduct>(products: readonly P[], key: string, locale: Locale): ProductAddress<P> {
  const product = findProductByKey(products, key);
  if (!product) return { kind: "unknown" };
  const slug = productSlug(product, locale);
  return slug === key ? { kind: "found", product } : { kind: "moved", product, slug };
}

/**
 * Translates product slugs between languages in addresses
 * (`lib/localeRoutes.ts`). Courses have the same kind of slugs and use it
 * for the course page (`route: "course"`).
 */
export function productSlugTranslator(products: readonly SluggedProduct[], route: PublicRouteId = "product"): ParamTranslator {
  const byKey = new Map<string, SluggedProduct>();
  // Row ids and older slugs first, so a current slug always wins a clash.
  for (const product of products) {
    if (product.dbId) byKey.set(product.dbId, product);
    for (const alias of product.aliases ?? []) byKey.set(alias, product);
  }
  for (const product of products) {
    for (const slug of Object.values(product.slugs ?? {})) if (slug) byKey.set(slug, product);
  }
  for (const product of products) byKey.set(product.id, product);

  return (id, params, locale) => {
    if (id !== route || !params.id) return params;
    const product = byKey.get(params.id);
    return product ? { ...params, id: productSlug(product, locale) } : params;
  };
}
