import type { GemColorDef, GemShape, Product } from "../../data/products";
import {
  DEFAULT_ROUND_SIZES,
  DEFAULT_SHAPED_SIZES,
  isStudioShape,
  scaleForSize,
  type GemEffect,
  type GemLook,
  type GemMaterial,
  type PlacedJewelry,
  type StudioShape,
} from "../../data/studioEditor";
import type { Localized } from "../../data/types";
import { toMinorUnits } from "../catalog/money";
import { sameSize, sizeKey, sizeLongestMm, sortSizes, type GemSize } from "../gemOptions";

/**
 * The 3D Studio's gems: the shop's gems, as the editor draws and offers them.
 *
 * Decided by the owner (2026-10-07): every product the shop sells in the
 * `gems` category is in the Studio, whatever its stock, so a composition is
 * always a set of jewellery a customer can buy. This module turns the
 * storefront catalogue (`useCatalog`) and the Studio's drawing data
 * (`studio_gem_appearances`) into that list. Pure: the React side lives in
 * `useStudioGems.ts`, the engine reads the result through `gemRegistry.ts`.
 *
 * - Look: the product's appearance row; without one, its shop shape and
 *   colour (so a gem added in the back office shows up straight away).
 * - Colours: one per colour variant (`swatch`: yellow / white gold…), else
 *   the product's own.
 * - Sizes: the sizes of the product's active variants — SS gauges or
 *   millimetres, as the back office sets them (decision 107) — drawn at their
 *   longest side; until it has any, SS2/SS5/SS7 for a round stone and
 *   3/4/5 mm for any other cut.
 */

/** One drawing row, as `studio_gem_appearances` stores it. */
export interface GemAppearanceRow {
  product_id: string;
  variant_id: string | null;
  shape: string | null;
  material: string;
  color: string;
  effect: string;
}

export interface StudioGemFinish {
  /** The colour variant; null = the product itself. */
  variantId: string | null;
  /** The variant's name; null = the product's own colour. */
  name: Localized | null;
  look: GemLook;
  /** Shop price of this colour, in minor units. */
  priceMinor: number;
  /** Photo of this colour, when the variant has its own. */
  image?: string;
}

export interface StudioGem {
  /** `productId` of the pieces: the database id (the slug on mock products). */
  key: string;
  /** Product page key (`products.slug`). */
  slug: string;
  name: Localized;
  image: string;
  family: string | null;
  /** The shop's shape, which groups the library ("Hearts", "Navettes"…). */
  shopShape: GemShape | null;
  shape: StudioShape;
  /** At least one. */
  finishes: StudioGemFinish[];
  /** Sizes, smallest first; at least one. */
  sizes: GemSize[];
  currency: string;
  /** What the shop sells of this gem, for the shopping list: its variants, else the product itself. */
  offers: StudioGemOffer[];
}

/** One thing the shop sells of a gem: a variant (a colour, a pack × size…), or the product itself. */
export interface StudioGemOffer {
  /** `product_variants.id`; null = the product itself (it has no variants). */
  variantId: string | null;
  /** The variant's name ("Pack de 10 · SS5"); null = the product itself. */
  name: Localized | null;
  /** Stones per item; null = not sold by the pack (or not said). */
  pack: number | null;
  size: GemSize | null;
  /** A colour variant (it has a swatch): a finish of the gem rather than a pack. */
  colour: boolean;
  priceMinor: number;
  stock?: "low" | "out";
  image?: string;
}

/** The shop's cuts drawn with the nearest Studio outline when a gem has no drawing row. */
const SHOP_SHAPE_TO_STUDIO: Record<GemShape, StudioShape> = {
  round: "round",
  heart: "heart",
  drop: "raindrop",
  navette: "navette",
  marquise: "navette",
  star: "rivoli-star",
  "rivoli-star": "rivoli-star",
  square: "square",
  triangle: "triangle",
  baguette: "baguette",
  flower: "starflower",
  "star-flower": "starflower",
  diamond: "kite",
  "xilion-rose": "round",
};

const CLEAR: GemLook = { shape: "round", material: "crystal", color: "#ffffff", effect: "none" };
/** Iridescent clear crystal: the look of the "multicolour" family (AB, Shimmer…). */
const IRIDESCENT_TINT = "#f1f3ff";
/** Metal colours of the prototype's mock gems, which name their metal as their colour. */
const METAL_COLORS: Record<string, string> = { gold: "#f2c25c", silver: "#e3e6ea", "white-gold": "#e3e6ea" };
const HEX = /^#[0-9a-f]{6}$/i;

function asMaterial(value: string): GemMaterial {
  return value === "metal" ? "metal" : "crystal";
}
function asEffect(value: string): GemEffect {
  return value === "iridescent" ? "iridescent" : "none";
}

/** The look of a gem without a drawing row: its shop shape and its colour family's shade. */
export function fallbackLook(product: Pick<Product, "shape" | "color">, colors: GemColorDef[]): GemLook {
  const shape = product.shape ? SHOP_SHAPE_TO_STUDIO[product.shape] : CLEAR.shape;
  const slug = product.color ?? null;
  if (slug && METAL_COLORS[slug]) return { shape, material: "metal", color: METAL_COLORS[slug], effect: "none" };
  const def = slug ? colors.find((c) => c.slug === slug) : undefined;
  if (def?.isMulticolor) return { shape, material: "crystal", color: IRIDESCENT_TINT, effect: "iridescent" };
  if (def?.hex && HEX.test(def.hex)) return { shape, material: "crystal", color: def.hex.toLowerCase(), effect: "none" };
  return { ...CLEAR, shape };
}

function priceMinor(value: number): number {
  try {
    return toMinorUnits(value);
  } catch {
    return 0;
  }
}

/** The Studio's gems, in the catalogue's order. */
export function buildStudioGems(products: Product[], appearances: GemAppearanceRow[], colors: GemColorDef[]): StudioGem[] {
  const byProduct = new Map<string, GemAppearanceRow>();
  const byVariant = new Map<string, GemAppearanceRow>();
  for (const row of appearances) {
    if (row.variant_id) byVariant.set(row.variant_id, row);
    else byProduct.set(row.product_id, row);
  }

  const gems: StudioGem[] = [];
  for (const product of products) {
    if (product.cat !== "gems") continue;
    const key = product.dbId ?? product.id;
    const own = byProduct.get(key);
    const base: GemLook =
      own && isStudioShape(own.shape) && HEX.test(own.color)
        ? { shape: own.shape, material: asMaterial(own.material), color: own.color.toLowerCase(), effect: asEffect(own.effect) }
        : fallbackLook(product, colors);

    const colourVariants = (product.variants ?? []).filter((v) => v.swatch);
    const finishes: StudioGemFinish[] = colourVariants.length
      ? colourVariants.map((v) => {
          const row = byVariant.get(v.id);
          const look: GemLook =
            row && HEX.test(row.color)
              ? { shape: base.shape, material: asMaterial(row.material), color: row.color.toLowerCase(), effect: asEffect(row.effect) }
              : { ...base, color: (v.swatch ?? base.color).toLowerCase() };
          return { variantId: v.id, name: v.name, look, priceMinor: priceMinor(v.price), ...(v.image ? { image: v.image } : {}) };
        })
      : [{ variantId: null, name: null, look: base, priceMinor: priceMinor(product.price) }];

    const sizes = sortSizes((product.variants ?? []).map((v) => v.size).filter((size): size is GemSize => size != null));

    const offers: StudioGemOffer[] = product.variants?.length
      ? product.variants.map((v) => ({
          variantId: v.id,
          name: v.name,
          pack: v.pack ?? null,
          size: v.size ?? null,
          colour: Boolean(v.swatch),
          priceMinor: priceMinor(v.price),
          ...(v.stock ? { stock: v.stock } : {}),
          ...(v.image ? { image: v.image } : {}),
        }))
      : [{ variantId: null, name: null, pack: null, size: null, colour: false, priceMinor: priceMinor(product.price), ...(product.stock ? { stock: product.stock } : {}) }];

    gems.push({
      key,
      slug: product.id,
      name: product.name,
      image: product.image,
      family: product.family,
      shopShape: product.shape ?? null,
      shape: base.shape,
      finishes,
      sizes: sizes.length ? sizes : base.shape === "round" ? DEFAULT_ROUND_SIZES : DEFAULT_SHAPED_SIZES,
      currency: product.currency ?? "EUR",
      offers,
    });
  }
  return gems;
}

/** The size a new piece of this gem starts at: the middle of its sizes. */
export function defaultSize(gem: Pick<StudioGem, "sizes">): GemSize {
  return gem.sizes[Math.floor((gem.sizes.length - 1) / 2)];
}

/**
 * The size of `gem` closest to `size` — the same one when it has it, else the
 * nearest longest side (when a piece changes product, it keeps its size if it can).
 */
export function nearestSize(gem: Pick<StudioGem, "sizes">, size: GemSize): GemSize {
  const same = gem.sizes.find((s) => sameSize(s, size));
  if (same) return same;
  const mm = sizeLongestMm(size);
  return gem.sizes.reduce((best, s) => (Math.abs(sizeLongestMm(s) - mm) < Math.abs(sizeLongestMm(best) - mm) ? s : best), gem.sizes[0]);
}

export function findFinish(gem: StudioGem, variantId: string | undefined | null): StudioGemFinish {
  return gem.finishes.find((f) => f.variantId === (variantId ?? null)) ?? gem.finishes[0];
}

/** What a new piece of this gem is made of, before it has a place on a tooth. */
export interface PieceSpec {
  productId: string;
  variantId?: string;
  size: GemSize;
  scale: number;
  look: GemLook;
}

export function pieceSpec(gem: StudioGem, finish: StudioGemFinish = gem.finishes[0], size: GemSize = defaultSize(gem)): PieceSpec {
  return {
    productId: gem.key,
    ...(finish.variantId ? { variantId: finish.variantId } : {}),
    size,
    scale: scaleForSize(size),
    look: finish.look,
  };
}

/** The patch that turns a placed piece into another gem / colour, keeping its size when it can. */
export function swapPatch(piece: Pick<PlacedJewelry, "size">, gem: StudioGem, finish: StudioGemFinish): Partial<PlacedJewelry> {
  const size = nearestSize(gem, piece.size);
  return { productId: gem.key, variantId: finish.variantId ?? undefined, size, scale: scaleForSize(size), look: finish.look };
}

/* ------------------------------------------------------------ shopping list */

/**
 * A line of a composition's shopping list: one shop item (a variant, or the
 * product itself) and how many of it cover the pieces it stands for.
 */
export interface EstimateLine {
  /** The gem (`StudioGem.key`). */
  productId: string;
  /** The pieces' colour variant; null = the product's own colour. */
  variantId: string | null;
  /** The pieces' size, when the gem is sold per size; null = one line whatever the size. */
  size: GemSize | null;
  /** The shop item bought: the variant added to the cart (null = the product itself). */
  offer: StudioGemOffer;
  /** Pieces of this gem, colour (and size) in the design. */
  pieces: number;
  /** Items to buy: packs covering the pieces, or one per piece for a charm sold singly. */
  quantity: number;
  unitMinor: number;
  totalMinor: number;
  /** The item's stock badge: "out" = it cannot be ordered now. */
  stock?: "low" | "out";
}

export interface CompositionEstimate {
  lines: EstimateLine[];
  totalMinor: number;
  currency: string;
  /** Pieces whose product (or size) the shop no longer sells: not counted. */
  unavailable: number;
}

export type EstimatedPiece = Pick<PlacedJewelry, "productId" | "variantId" | "look"> & { size?: GemSize };

/**
 * The cheapest way to cover `pieces` stones with ONE of these offers, in
 * stock first: each offer is bought `ceil(pieces / pack)` times. An offer
 * without a pack covers every piece at once for a crystal, one piece for a
 * metal charm (sold singly). Ties go to fewer stones, then the smaller pack.
 */
export function coverPieces(
  offers: StudioGemOffer[],
  pieces: number,
  metal: boolean,
): { offer: StudioGemOffer; quantity: number } | null {
  const inStock = offers.filter((o) => o.stock !== "out");
  const pool = inStock.length ? inStock : offers;
  let best: { offer: StudioGemOffer; quantity: number; cost: number; stones: number } | null = null;
  for (const offer of pool) {
    const per = offer.pack ?? (metal ? 1 : pieces);
    const quantity = Math.ceil(pieces / per);
    const cost = quantity * offer.priceMinor;
    const stones = quantity * per;
    if (
      !best ||
      cost < best.cost ||
      (cost === best.cost && (stones < best.stones || (stones === best.stones && per < (best.offer.pack ?? Infinity))))
    )
      best = { offer, quantity, cost, stones };
  }
  return best && { offer: best.offer, quantity: best.quantity };
}

/**
 * What a composition takes to buy at the shop, and its INDICATIVE value in
 * minor units — never a price charged: the cart is priced again by the
 * database at checkout.
 *
 * Rule (owner's request, 2026-10-11; replaces "one pack per crystal and
 * colour" of 2026-10-07):
 * - a gem in colours (gold charms…) is bought in the pieces' colour, one per
 *   piece (or by its pack, if the variant has one);
 * - a crystal sold in packs is bought in the pieces' size (when the shop sells
 *   it per size), in the cheapest single pack that covers them, in stock
 *   first: 2 pieces → at least the pack of 10; 30 pieces → 3 × 10 or 2 × 25,
 *   whichever costs less;
 * - a crystal without packs counts once whatever the number of pieces.
 * A piece whose gem, colour or size the shop does not sell counts as `unavailable`.
 */
export function estimateComposition(
  pieces: EstimatedPiece[],
  gemByKey: (key: string) => StudioGem | undefined,
  currency = "EUR",
): CompositionEstimate {
  const groups = new Map<string, { gem: StudioGem; finish: StudioGemFinish; size: GemSize | null; candidates: StudioGemOffer[]; pieces: number }>();
  let unavailable = 0;
  let cur = currency;
  for (const p of pieces) {
    const gem = gemByKey(p.productId);
    const finish = gem?.finishes.find((f) => f.variantId === (p.variantId ?? null));
    if (!gem || !finish) {
      unavailable += 1;
      continue;
    }
    let size: GemSize | null = null;
    let candidates: StudioGemOffer[];
    if (finish.variantId) {
      candidates = gem.offers.filter((o) => o.variantId === finish.variantId);
    } else {
      const options = gem.offers.filter((o) => !o.colour);
      const perSize = options.some((o) => o.size != null);
      if (perSize) size = p.size ?? null;
      candidates = perSize ? options.filter((o) => sameSize(o.size, size)) : options;
    }
    if (!candidates.length) {
      unavailable += 1;
      continue;
    }
    cur = gem.currency;
    const id = `${gem.key}|${finish.variantId ?? ""}|${size ? sizeKey(size) : ""}`;
    const group = groups.get(id) ?? { gem, finish, size, candidates, pieces: 0 };
    group.pieces += 1;
    groups.set(id, group);
  }

  const lines: EstimateLine[] = [];
  for (const g of groups.values()) {
    const plan = coverPieces(g.candidates, g.pieces, g.finish.look.material === "metal");
    if (!plan) continue;
    lines.push({
      productId: g.gem.key,
      variantId: g.finish.variantId,
      size: g.size,
      offer: plan.offer,
      pieces: g.pieces,
      quantity: plan.quantity,
      unitMinor: plan.offer.priceMinor,
      totalMinor: plan.quantity * plan.offer.priceMinor,
      ...(plan.offer.stock ? { stock: plan.offer.stock } : {}),
    });
  }
  return { lines, totalMinor: lines.reduce((sum, l) => sum + l.totalMinor, 0), currency: cur, unavailable };
}
