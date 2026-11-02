/**
 * What the design's gems really are, in words, for the try-on render
 * (decision 111 (k), 2026-11-02): one line per kind of gem — "a faceted
 * crystal, teardrop cut, with an iridescent AB coating", "a polished solid 18k
 * yellow gold charm (cherries)" — so the image model renders real jewellery
 * rather than the smooth, plastic-looking gems of the 3D preview and the flat
 * marks of the guide. Text only: product photos were tried and dropped the
 * same day (owner's decision: a design can hold many different gems, too many
 * images for the model's input).
 *
 * The gems come from the STORED scene (read from the database by the
 * function), never from the browser. Pure: the product names are read in `index.ts`.
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

/** At most this many kinds of gem are listed, the most used first. */
export const MAX_GEM_KINDS = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The distinct gems of a stored scene (product + variant), the most used first; malformed pieces are skipped. */
export function designGems(scene: unknown, max = MAX_GEM_KINDS): DesignGem[] {
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

/** The gem list sent after the images, the most used gem first; null for no gem. */
export function gemListText(entries: readonly { gem: DesignGem; name: string | null }[]): string | null {
  if (entries.length === 0) return null;
  const lines = entries.map((e) => {
    const marks = `${e.gem.count} mark${e.gem.count === 1 ? "" : "s"}`;
    // The shop name is data from the database, kept short and plain.
    const name = e.name ? ` (${e.name.replace(/[^\p{L}\p{N}®™ .,'’-]/gu, "").slice(0, 80)})` : "";
    return `- ${gemWords(e.gem)}${name}: ${marks}, drawn in its colour #${e.gem.color.slice(1)}.`;
  });
  return ["GEM LIST — what each gem of IMAGE 1 really is (match a mark by its cut and colour):", ...lines].join("\n");
}
