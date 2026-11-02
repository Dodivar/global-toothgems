/**
 * The real look of the design's gems for the try-on render (decision 111 (k),
 * 2026-11-02): one studio photograph per kind of gem in the creation — the
 * shop's own product photo (bucket `product-media`) — sent after the design
 * render, so the image model draws real faceted crystals and polished gold
 * rather than the smooth, plastic-looking gems of the 3D preview and the flat
 * marks of the guide.
 *
 * The gems come from the STORED scene (read from the database by the
 * function), never from the browser. Pure: the database and storage reads are
 * in `index.ts`.
 */

export interface DesignGem {
  productId: string;
  variantId: string | null;
  /** How many pieces of the design are this gem. */
  count: number;
  shape: string;
  material: "crystal" | "metal";
  color: string;
  iridescent: boolean;
}

/** A row of `product_media`, as `pickMedia` reads it. */
export interface MediaRow {
  product_id: string;
  variant_id: string | null;
  storage_path: string;
  is_primary: boolean;
  position: number;
}

/** At most this many gem photos per render: the request inlines every image. */
export const MAX_GEM_PHOTOS = 6;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The distinct gems of a stored scene (product + variant), the most used first; malformed pieces are skipped. */
export function designGems(scene: unknown, max = MAX_GEM_PHOTOS): DesignGem[] {
  const pieces = scene && typeof scene === "object" ? (scene as Record<string, unknown>).pieces : null;
  if (!Array.isArray(pieces)) return [];
  const byKey = new Map<string, DesignGem>();
  for (const raw of pieces.slice(0, 200)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.productId !== "string" || !UUID.test(p.productId)) continue;
    const variantId = typeof p.variantId === "string" && UUID.test(p.variantId) ? p.variantId.toLowerCase() : null;
    const productId = p.productId.toLowerCase();
    const key = `${productId}|${variantId ?? ""}`;
    const known = byKey.get(key);
    if (known) {
      known.count++;
      continue;
    }
    const look = (p.look && typeof p.look === "object" ? p.look : {}) as Record<string, unknown>;
    byKey.set(key, {
      productId,
      variantId,
      count: 1,
      shape: typeof look.shape === "string" && /^[a-z-]{2,30}$/.test(look.shape) ? look.shape : "round",
      material: look.material === "metal" ? "metal" : "crystal",
      color: typeof look.color === "string" && /^#[0-9a-f]{6}$/i.test(look.color) ? look.color.toLowerCase() : "#ffffff",
      iridescent: look.effect === "iridescent",
    });
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count).slice(0, max);
}

/**
 * The photo of a gem among its product's media: the variant's own primary
 * image, else any of the variant's, else the product's primary, else its
 * first by position. Null when the product has no image.
 */
export function pickMedia(rows: readonly MediaRow[], gem: Pick<DesignGem, "productId" | "variantId">): string | null {
  const own = rows.filter((r) => r.product_id.toLowerCase() === gem.productId && /\.(webp|jpe?g|png)$/i.test(r.storage_path));
  const order = (list: MediaRow[]) => [...list].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);
  const variant = gem.variantId ? order(own.filter((r) => r.variant_id?.toLowerCase() === gem.variantId)) : [];
  if (variant.length) return variant[0].storage_path;
  const product = order(own.filter((r) => !r.variant_id));
  if (product.length) return product[0].storage_path;
  return order(own)[0]?.storage_path ?? null;
}

const CUTS: Record<string, string> = {
  round: "round cut",
  square: "square cut",
  baguette: "baguette cut",
  navette: "navette (marquise) cut",
  kite: "kite (diamond-shaped) cut",
  raindrop: "teardrop cut",
  heart: "heart cut",
  "rivoli-star": "star cut",
  starflower: "five-pointed star cut",
  triangle: "triangle cut",
  bolt: "lightning bolt",
  cherries: "cherries",
  dachshund: "dachshund",
  snake: "snake",
  "halo-star": "star with a halo",
  "open-heart": "open heart",
};

/** What the gem is, in words: a faceted crystal (and its coating) or a polished gold charm. */
export function gemWords(gem: DesignGem): string {
  const cut = CUTS[gem.shape] ?? `${gem.shape} cut`;
  if (gem.material === "metal") {
    const white = /^#(e|f|d)[0-9a-f](e|f|d)[0-9a-f](e|f|d)[0-9a-f]$/i.test(gem.color);
    return `a polished solid 18k ${white ? "white" : "yellow"} gold charm (${cut})`;
  }
  return `a faceted crystal, ${cut}${gem.iridescent ? ", with an iridescent AB coating" : ""}`;
}

/** The text after the images naming each gem photo, in the order the photos are sent; null without any photo. */
export function gemPhotosText(entries: readonly { gem: DesignGem; name: string | null }[]): string | null {
  if (entries.length === 0) return null;
  const lines = entries.map((e, i) => {
    const marks = `${e.gem.count} mark${e.gem.count === 1 ? "" : "s"}`;
    // The shop name is data from the database, kept short and plain.
    const name = e.name ? `${e.name.replace(/[^\p{L}\p{N}®™ .,'’()-]/gu, "").slice(0, 80)} — ` : "";
    return `GEM PHOTO ${i + 1}: ${name}${gemWords(e.gem)}; ${marks} in IMAGE 1.`;
  });
  return [
    "GEM PHOTOS — after IMAGE 3, one studio photograph of each kind of gem in this design, in this order:",
    ...lines,
    "Each mark in IMAGE 1 is one of these gems (match it by its cut and colour): render it exactly like its photo.",
  ].join("\n");
}
