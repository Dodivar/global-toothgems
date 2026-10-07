import type { GemColorDef, GemShape, Product } from "../../data/products";
import {
  DEFAULT_STUDIO_SIZES,
  isStudioShape,
  scaleForSs,
  type GemEffect,
  type GemLook,
  type GemMaterial,
  type PlacedJewelry,
  type StudioShape,
} from "../../data/studioEditor";
import type { Localized } from "../../data/types";
import { toMinorUnits } from "../catalog/money";

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
 * - Sizes: the product's active `ss` variants; SS2, SS5, SS7 until it has any.
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
  /** Stone sizes, ascending; at least one. */
  sizes: number[];
  currency: string;
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

    const sizes = [...new Set((product.variants ?? []).map((v) => v.ss).filter((ss): ss is number => typeof ss === "number"))].sort(
      (a, b) => a - b,
    );

    gems.push({
      key,
      slug: product.id,
      name: product.name,
      image: product.image,
      family: product.family,
      shopShape: product.shape ?? null,
      shape: base.shape,
      finishes,
      sizes: sizes.length ? sizes : DEFAULT_STUDIO_SIZES,
      currency: product.currency ?? "EUR",
    });
  }
  return gems;
}

/** The size a new piece of this gem starts at: the middle of its sizes. */
export function defaultSize(gem: Pick<StudioGem, "sizes">): number {
  return gem.sizes[Math.floor((gem.sizes.length - 1) / 2)];
}

/** The size of `gem` closest to `ss` (when a piece changes product, it keeps its size if it can). */
export function nearestSize(gem: Pick<StudioGem, "sizes">, ss: number): number {
  return gem.sizes.reduce((best, s) => (Math.abs(s - ss) < Math.abs(best - ss) ? s : best), gem.sizes[0]);
}

export function findFinish(gem: StudioGem, variantId: string | undefined | null): StudioGemFinish {
  return gem.finishes.find((f) => f.variantId === (variantId ?? null)) ?? gem.finishes[0];
}

/** What a new piece of this gem is made of, before it has a place on a tooth. */
export interface PieceSpec {
  productId: string;
  variantId?: string;
  ss: number;
  scale: number;
  look: GemLook;
}

export function pieceSpec(gem: StudioGem, finish: StudioGemFinish = gem.finishes[0], ss: number = defaultSize(gem)): PieceSpec {
  return {
    productId: gem.key,
    ...(finish.variantId ? { variantId: finish.variantId } : {}),
    ss,
    scale: scaleForSs(ss),
    look: finish.look,
  };
}

/** The patch that turns a placed piece into another gem / colour, keeping its size when it can. */
export function swapPatch(piece: Pick<PlacedJewelry, "ss">, gem: StudioGem, finish: StudioGemFinish): Partial<PlacedJewelry> {
  const ss = nearestSize(gem, piece.ss);
  return { productId: gem.key, variantId: finish.variantId ?? undefined, ss, scale: scaleForSs(ss), look: finish.look };
}

/* ------------------------------------------------------------ estimate */

/** A line of a composition's shopping list. */
export interface EstimateLine {
  productId: string;
  variantId: string | null;
  /** Pieces of this product and colour in the design. */
  pieces: number;
  /** Shop items to buy: one pack for a crystal, one per piece for a metal charm. */
  quantity: number;
  unitMinor: number;
  totalMinor: number;
}

export interface CompositionEstimate {
  lines: EstimateLine[];
  totalMinor: number;
  currency: string;
  /** Pieces whose product the shop no longer sells: not counted. */
  unavailable: number;
}

/**
 * INDICATIVE value of a composition at shop prices, in minor units — what
 * the pieces cost to buy, never a price charged (it is not sent to checkout).
 *
 * Rule (to confirm with the owner, 2026-10-07): crystals are sold by the
 * pack, so each crystal product and colour counts once whatever the number
 * of pieces; metal charms are sold one by one, so each piece counts.
 */
export function estimateComposition(
  pieces: Pick<PlacedJewelry, "productId" | "variantId" | "look">[],
  gemByKey: (key: string) => StudioGem | undefined,
  currency = "EUR",
): CompositionEstimate {
  const lines = new Map<string, EstimateLine>();
  let unavailable = 0;
  let cur = currency;
  for (const p of pieces) {
    const gem = gemByKey(p.productId);
    const finish = gem?.finishes.find((f) => f.variantId === (p.variantId ?? null));
    if (!gem || !finish) {
      unavailable += 1;
      continue;
    }
    cur = gem.currency;
    const id = `${p.productId}|${finish.variantId ?? ""}`;
    const line = lines.get(id) ?? { productId: p.productId, variantId: finish.variantId, pieces: 0, quantity: 0, unitMinor: finish.priceMinor, totalMinor: 0 };
    line.pieces += 1;
    line.quantity = finish.look.material === "metal" ? line.pieces : 1;
    line.totalMinor = line.quantity * line.unitMinor;
    lines.set(id, line);
  }
  const list = [...lines.values()];
  return { lines: list, totalMinor: list.reduce((sum, l) => sum + l.totalMinor, 0), currency: cur, unavailable };
}
