import type { Product } from "../data/products";

/**
 * Picks, from the catalogue, the products the home page's category mosaic
 * shows. Pure: the mosaic passes the catalogue it holds (the server's seed,
 * then the store), so the server and the first browser render agree.
 */

/**
 * The product a category tile features: the first of `slugs` the catalogue
 * holds with a picture, else the first product of `family` within `cat`, else
 * the first of `cat`. `undefined` while the catalogue is empty.
 */
export function pickFeaturedProduct(
  products: Product[],
  { cat, family, slugs = [] }: { cat: string; family?: string; slugs?: string[] },
): Product | undefined {
  const shown = products.filter((p) => p.cat === cat && p.image && p.stock !== "out");
  for (const slug of slugs) {
    const match = shown.find((p) => p.id === slug || p.aliases?.includes(slug));
    if (match) return match;
  }
  return (family ? shown.find((p) => p.family === family) : undefined) ?? shown[0];
}

/**
 * Up to `max` distinct product pictures of `cat`, in catalogue order, for an
 * exploded arrangement. Out-of-stock products are left out.
 */
export function pickBurstImages(products: Product[], cat: string, max: number): { key: string; src: string }[] {
  const seen = new Set<string>();
  const out: { key: string; src: string }[] = [];
  for (const p of products) {
    if (out.length >= max) break;
    if (p.cat !== cat || !p.image || p.stock === "out" || seen.has(p.image)) continue;
    seen.add(p.image);
    out.push({ key: p.id, src: p.image });
  }
  return out;
}
