import type { Localized } from "./types";
import type { BadgeTone } from "../components/ui/Badge";

/**
 * Cut of a gem, as an ASCII slug. The slug is what travels in the `forme` URL
 * parameter, so a link built in French still resolves in English — display
 * labels live in the locale files under `shop.shapes.*`.
 */
export type GemShape =
  | "round"
  | "heart"
  | "drop"
  | "navette"
  | "star"
  | "square"
  | "triangle"
  | "baguette"
  | "flower"
  | "marquise"
  | "diamond"
  | "rivoli-star"
  | "star-flower"
  | "xilion-rose";

/**
 * Every known cut. Not a display order: shape lists are shown alphabetically
 * by translated label (`sortByShapeLabel`).
 */
export const GEM_SHAPES: GemShape[] = [
  "round",
  "heart",
  "drop",
  "navette",
  "star",
  "square",
  "triangle",
  "baguette",
  "flower",
  "marquise",
  "diamond",
  "rivoli-star",
  "star-flower",
  "xilion-rose",
];

/**
 * Colour family of a gem, as an ASCII slug. It travels in the `couleur` URL
 * parameter exactly like `forme` does, so a link built in one language still
 * resolves in the other. The list itself is data: the team manages it from the
 * back office (`gem_colors` table), so a slug is any string here.
 */
export type GemColor = string;

/**
 * One entry of the colour filter.
 *
 * A colour is one exact shade (`hex`). Gems with special reflections or several
 * colours share the single multicolour entry, which has no shade of its own and
 * is painted with a fixed iridescent swatch.
 */
export interface GemColorDef {
  slug: GemColor;
  name: Localized;
  /** `#rrggbb`; null only for the multicolour entry. */
  hex: string | null;
  isMulticolor: boolean;
}

/**
 * The colours the prototype runs on when no database is configured — the same
 * slugs, names and shades the `gem_colors` migration seeds.
 */
export const FALLBACK_GEM_COLORS: GemColorDef[] = [
  { slug: "crystal", name: { fr: "Cristal clair", en: "Clear crystal" }, hex: "#d3e0ef", isMulticolor: false },
  { slug: "aquamarine", name: { fr: "Aigue-marine", en: "Aquamarine" }, hex: "#6fb3c9", isMulticolor: false },
  { slug: "capri", name: { fr: "Bleu Capri", en: "Capri blue" }, hex: "#1f6dab", isMulticolor: false },
  { slug: "sapphire", name: { fr: "Saphir", en: "Sapphire" }, hex: "#2b3f96", isMulticolor: false },
  { slug: "amethyst", name: { fr: "Améthyste", en: "Amethyst" }, hex: "#8e6bb5", isMulticolor: false },
  { slug: "heliotrope", name: { fr: "Héliotrope AB", en: "Heliotrope AB" }, hex: "#9c8fd8", isMulticolor: false },
  { slug: "peridot", name: { fr: "Péridot", en: "Peridot" }, hex: "#8fb34a", isMulticolor: false },
  { slug: "topaz", name: { fr: "Topaze", en: "Topaz" }, hex: "#d9a03f", isMulticolor: false },
  { slug: "opal", name: { fr: "Opale", en: "Opal" }, hex: "#cfe6e2", isMulticolor: false },
  { slug: "gold", name: { fr: "Or 18k", en: "18k gold" }, hex: "#c8992f", isMulticolor: false },
  { slug: "multicolor", name: { fr: "Multicolore", en: "Multicolour" }, hex: null, isMulticolor: true },
];

/** Fixed iridescent fill of the multicolour entry. */
export const MULTICOLOR_SWATCH =
  "conic-gradient(from 200deg, #f2d7ef, #9bb8e6, #cfe6e2, #fbe7bb, #e0cdf0, #f2d7ef)";

/**
 * Swatch fill of a colour.
 *
 * A gradient from a pale tint to the exact shade rather than a flat disc: a
 * crystal reads as a highlight and a shadow, and a flat circle of clear
 * crystal would be indistinguishable from a disabled chip. The angle is shared
 * so a row of swatches lines up.
 */
export function colorSwatchFill(color: Pick<GemColorDef, "hex" | "isMulticolor">): string {
  if (color.isMulticolor || !color.hex) return MULTICOLOR_SWATCH;
  return `linear-gradient(135deg, color-mix(in srgb, ${color.hex} 22%, #ffffff), ${color.hex})`;
}

/**
 * Shop category keys, as used by the `categorie` URL parameter and the
 * `shop.categories.*` labels. The database's category slugs are mapped onto
 * these in `lib/catalog/mapping.ts`.
 */
export type ShopCategory = "Gems" | "Outils" | "Kits" | "Suivi" | "Accessoires";

export const SHOP_CATEGORIES: ShopCategory[] = ["Gems", "Outils", "Kits", "Suivi", "Accessoires"];

/** A purchasable option of a catalogue product (colour, size, box quantity…). */
export interface ProductVariant {
  id: string;
  name: Localized;
  /** Display price in major units; the server recomputes every price at checkout. */
  price: number;
  compareAtPrice?: number;
  stock?: "low" | "out";
  /** Gem options (`lib/gemOptions.ts`): stones per pack, and stone size (SS). */
  pack?: number;
  ss?: number;
  /** Colour dot of a colour variant, `#rrggbb`. */
  swatch?: string;
  /** First photo showing this variant: the gallery moves to it when the variant is picked. */
  image?: string;
}

export interface Product {
  /** URL key: the product slug in the default language. */
  id: string;
  /** Localized slugs that also resolve to this product (e.g. the English URL). */
  aliases?: string[];
  name: Localized;
  subtitle: Localized;
  price: number;
  compareAtPrice?: number;
  badge?: Localized;
  badgeTone?: BadgeTone;
  rating: number;
  reviewCount: number;
  stock?: "low" | "out";
  image: string;
  /** `null` when the product's category is not one the shop filters on. */
  cat: ShopCategory | null;
  material: string;
  /** Gems only. Tools, kits and aftercare have no cut. */
  shape?: GemShape;
  /** Gems only, like `shape`. */
  color?: GemColor;
  description?: Localized;
  center?: Localized;
  gallery?: { src: string; alt: Localized }[];
  /** Database products only. Mock products use the prototype's shade/size pickers. */
  variants?: ProductVariant[];
  isFeatured?: boolean;
}

const img = (name: string) => new URL(`../assets/photos/${name}`, import.meta.url).href;

export const PRODUCTS: Product[] = [
  {
    id: "aurora-heart",
    name: { fr: "Aurora Heart", en: "Aurora Heart" },
    subtitle: { fr: "Or 18k · 2,0 mm", en: "18k gold · 2.0mm" },
    price: 49,
    badge: { fr: "Nouveau drop", en: "New drop" },
    rating: 4.8,
    reviewCount: 126,
    image: img("img-04.jpg"),
    cat: "Gems",
    material: "Or 18k",
    shape: "heart",
    color: "gold",
    description: {
      fr: "Cœur en or 18k à centre en opale de laboratoire. Dos plat pour le contact de l’adhésif, bords polis, livré en capsule stérile à usage unique.",
      en: "18k gold heart with a lab-grown opal center. Flat back for adhesive contact, polished edges, delivered in a single-use sterile capsule.",
    },
    center: { fr: "Opale de laboratoire", en: "Lab-grown opal" },
    gallery: [
      { src: img("img-04.jpg"), alt: { fr: "Aurora Heart de face", en: "Aurora Heart, front view" } },
      { src: img("img-07.jpg"), alt: { fr: "Gem de profil", en: "Gem, side view" } },
      { src: img("img-11.jpg"), alt: { fr: "Assortiment de gems", en: "Assortment of gems" } },
      { src: img("mouth-02.jpg"), alt: { fr: "Gem posée sur dent", en: "Gem applied on a tooth" } },
    ],
  },
  {
    id: "solitaire",
    name: { fr: "Solitaire Cristal", en: "Crystal Solitaire" },
    subtitle: { fr: "Swarovski · 1,8 mm", en: "Swarovski · 1.8mm" },
    price: 29,
    compareAtPrice: 35,
    rating: 4.6,
    reviewCount: 318,
    image: img("img-07.jpg"),
    cat: "Gems",
    material: "Swarovski",
    shape: "round",
    color: "crystal",
    gallery: [
      { src: img("img-07.jpg"), alt: { fr: "Solitaire Cristal, vue de face", en: "Crystal Solitaire, front view" } },
      { src: img("img-02.jpg"), alt: { fr: "Détail de la taille", en: "Cut detail" } },
      { src: img("img-12.jpg"), alt: { fr: "Assortiment de tailles", en: "Size assortment" } },
      { src: img("mouth-03.jpg"), alt: { fr: "Gem posée sur dent", en: "Gem applied on a tooth" } },
    ],
  },
  {
    id: "opale",
    name: { fr: "Goutte d’Opale", en: "Opal Drop" },
    subtitle: { fr: "Opale de labo · 2,2 mm", en: "Lab opal · 2.2mm" },
    price: 54,
    rating: 4.9,
    reviewCount: 74,
    stock: "low",
    image: img("img-20.jpg"),
    cat: "Gems",
    material: "Opale de labo",
    shape: "drop",
    color: "opal",
  },
  {
    id: "starter-kit",
    name: { fr: "Kit Starter Pro", en: "Starter Pro Kit" },
    subtitle: { fr: "Outils + 20 gems", en: "Tools + 20 gems" },
    price: 189,
    badge: { fr: "Kit", en: "Kit" },
    badgeTone: "ink",
    rating: 4.7,
    reviewCount: 212,
    image: img("img-11.jpg"),
    cat: "Kits",
    material: "Cristal",
    gallery: [
      { src: img("img-11.jpg"), alt: { fr: "Contenu du kit Starter Pro", en: "Starter Pro kit contents" } },
      { src: img("img-08.jpg"), alt: { fr: "Adhesif et mordancage", en: "Adhesive and etching gel" } },
      { src: img("img-01.jpg"), alt: { fr: "Outils de pose", en: "Placement tools" } },
      { src: img("mouth-04.jpg"), alt: { fr: "Pose en cabine", en: "Placement in the chair" } },
    ],
  },
  {
    id: "aquamarine",
    name: { fr: "Aquamarine SS7", en: "Aquamarine SS7" },
    subtitle: { fr: "Cristal · 2,2 mm", en: "Crystal · 2.2mm" },
    price: 27,
    rating: 4.7,
    reviewCount: 88,
    image: img("img-05.jpg"),
    cat: "Gems",
    material: "Cristal",
    shape: "round",
    color: "aquamarine",
    gallery: [
      { src: img("img-05.jpg"), alt: { fr: "Aquamarine SS7, vue de face", en: "Aquamarine SS7, front view" } },
      { src: img("img-15.jpg"), alt: { fr: "Nuances de bleu", en: "Blue shades" } },
      { src: img("img-17.jpg"), alt: { fr: "Détail de la taille", en: "Cut detail" } },
      { src: img("mouth-01.jpg"), alt: { fr: "Gem posée sur dent", en: "Gem applied on a tooth" } },
    ],
  },
  {
    id: "capri",
    name: { fr: "Capri Blue SS9", en: "Capri Blue SS9" },
    subtitle: { fr: "Cristal · 2,6 mm", en: "Crystal · 2.6mm" },
    price: 31,
    rating: 4.6,
    reviewCount: 64,
    image: img("img-15.jpg"),
    cat: "Gems",
    material: "Cristal",
    shape: "navette",
    color: "capri",
    gallery: [
      { src: img("img-15.jpg"), alt: { fr: "Capri Blue SS9, vue de face", en: "Capri Blue SS9, front view" } },
      { src: img("img-05.jpg"), alt: { fr: "Nuances de bleu", en: "Blue shades" } },
      { src: img("img-14.jpg"), alt: { fr: "Détail de la taille", en: "Cut detail" } },
      { src: img("mouth-05.jpg"), alt: { fr: "Gem posée sur dent", en: "Gem applied on a tooth" } },
    ],
  },
  {
    id: "amethyste",
    name: { fr: "Light Amethyst SS7", en: "Light Amethyst SS7" },
    subtitle: { fr: "Cristal · 2,2 mm", en: "Crystal · 2.2mm" },
    price: 27,
    rating: 4.8,
    reviewCount: 52,
    image: img("img-06.jpg"),
    cat: "Gems",
    material: "Cristal",
    shape: "square",
    color: "amethyst",
    gallery: [
      { src: img("img-06.jpg"), alt: { fr: "Light Amethyst SS7, vue de face", en: "Light Amethyst SS7, front view" } },
      { src: img("img-09.jpg"), alt: { fr: "Détail de la taille", en: "Cut detail" } },
      { src: img("img-18.jpg"), alt: { fr: "Assortiment de coloris", en: "Colour assortment" } },
      { src: img("mouth-03.jpg"), alt: { fr: "Gem posée sur dent", en: "Gem applied on a tooth" } },
    ],
  },
  {
    id: "peridot",
    name: { fr: "Peridot SS7", en: "Peridot SS7" },
    subtitle: { fr: "Cristal · 2,2 mm", en: "Crystal · 2.2mm" },
    price: 27,
    rating: 4.5,
    reviewCount: 41,
    image: img("img-19.jpg"),
    cat: "Gems",
    material: "Cristal",
    shape: "triangle",
    color: "peridot",
  },
  {
    id: "sun",
    name: { fr: "Sun SS9", en: "Sun SS9" },
    subtitle: { fr: "Cristal · 2,6 mm", en: "Crystal · 2.6mm" },
    price: 31,
    rating: 4.7,
    reviewCount: 37,
    image: img("img-18.jpg"),
    cat: "Gems",
    material: "Cristal",
    shape: "star",
    color: "topaz",
  },
  {
    id: "sunflower",
    name: { fr: "Sunflower SS7", en: "Sunflower SS7" },
    subtitle: { fr: "Cristal · 2,2 mm", en: "Crystal · 2.2mm" },
    price: 27,
    rating: 4.6,
    reviewCount: 29,
    image: img("img-13.jpg"),
    cat: "Gems",
    material: "Cristal",
    shape: "flower",
    color: "topaz",
  },
  {
    id: "heliotrope",
    name: { fr: "Heliotrope AB SS9", en: "Heliotrope AB SS9" },
    subtitle: { fr: "Cristal AB · 2,6 mm", en: "Crystal AB · 2.6mm" },
    price: 33,
    badge: { fr: "Nouveau drop", en: "New drop" },
    rating: 4.9,
    reviewCount: 24,
    image: img("img-09.jpg"),
    cat: "Gems",
    material: "Cristal AB",
    shape: "baguette",
    color: "heliotrope",
  },
  {
    id: "sapphire-ab",
    name: { fr: "Sapphire AB SS9", en: "Sapphire AB SS9" },
    subtitle: { fr: "Cristal AB · 2,6 mm", en: "Crystal AB · 2.6mm" },
    price: 33,
    rating: 4.8,
    reviewCount: 31,
    image: img("img-14.jpg"),
    cat: "Gems",
    material: "Cristal AB",
    shape: "navette",
    color: "sapphire",
  },
  {
    id: "gants",
    name: { fr: "Gants nitrile noirs (20)", en: "Black nitrile gloves (20)" },
    subtitle: { fr: "Tailles S · M · L", en: "Sizes S · M · L" },
    price: 12,
    rating: 4.5,
    reviewCount: 58,
    image: img("img-01.jpg"),
    cat: "Outils",
    material: "",
  },
  {
    id: "bond",
    name: { fr: "Lingettes Omniwipes (100)", en: "Omniwipes (100)" },
    subtitle: { fr: "Désinfection · grade clinique", en: "Disinfection · clinical grade" },
    price: 19,
    rating: 4.8,
    reviewCount: 141,
    stock: "out",
    image: img("img-08.jpg"),
    cat: "Outils",
    material: "",
  },
  {
    id: "etoile",
    name: { fr: "Étoile Or", en: "Gold Star" },
    subtitle: { fr: "Or 18k · 2,5 mm", en: "18k gold · 2.5mm" },
    price: 59,
    rating: 4.7,
    reviewCount: 96,
    image: img("img-02.jpg"),
    cat: "Gems",
    material: "Or 18k",
    shape: "star",
    color: "gold",
    gallery: [
      { src: img("img-02.jpg"), alt: { fr: "Étoile Or, vue de face", en: "Gold Star, front view" } },
      { src: img("img-07.jpg"), alt: { fr: "Détail de la monture", en: "Setting detail" } },
      { src: img("img-13.jpg"), alt: { fr: "Assortiment de formes", en: "Shape assortment" } },
      { src: img("mouth-02.jpg"), alt: { fr: "Gem posée sur dent", en: "Gem applied on a tooth" } },
    ],
  },
  {
    id: "aftercare",
    name: { fr: "Cartes de suivi (50)", en: "Aftercare cards (50)" },
    subtitle: { fr: "FR · EN · DE", en: "FR · EN · DE" },
    price: 19,
    rating: 4.4,
    reviewCount: 33,
    image: img("mouth-01.jpg"),
    cat: "Suivi",
    material: "",
  },
];

export function getProduct(id: string, list: Product[] = PRODUCTS): Product | undefined {
  return list.find((p) => p.id === id || p.aliases?.includes(id));
}

export function bestSellers(list: Product[] = PRODUCTS): Product[] {
  return list
    .filter((p) => p.cat === "Gems" || p.cat === "Kits")
    .sort((a, b) => Number(b.isFeatured ?? false) - Number(a.isFeatured ?? false) || b.reviewCount - a.reviewCount)
    .slice(0, 4);
}

/**
 * Cross-sell for a product page: the same category first, then the rest of
 * the catalogue, never the product itself.
 */
export function relatedProducts(product: Product, list: Product[] = PRODUCTS): Product[] {
  const others = list.filter((p) => p.id !== product.id);
  const sameCategory = others.filter((p) => p.cat !== null && p.cat === product.cat);
  const rest = others.filter((p) => !sameCategory.includes(p));
  return [...sameCategory, ...rest].slice(0, 4);
}

export interface ShapeGroup {
  shape: GemShape;
  count: number;
}

/**
 * Shapes that actually have gems behind them, in `GEM_SHAPES` order; screens
 * sort them by label through `useShapesInCatalog`.
 *
 * Derived rather than hardcoded so a shape tile can never land on an empty
 * result page: adding or removing a gem updates the carousel by itself.
 */
export function shapesInCatalog(list: Product[] = PRODUCTS): ShapeGroup[] {
  const groups: ShapeGroup[] = [];
  for (const shape of GEM_SHAPES) {
    const count = list.filter((p) => p.shape === shape).length;
    if (count > 0) groups.push({ shape, count });
  }
  return groups;
}

/**
 * Items ordered alphabetically by their shape's translated label.
 *
 * Sorted at render time, not by slug: "Étoile" must sit beside "Diamant" in
 * French, and the English order differs from the French one.
 */
export function sortByShapeLabel<T>(
  items: T[],
  shapeOf: (item: T) => GemShape,
  label: (shape: GemShape) => string,
  locale: string,
): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  return [...items].sort((a, b) => collator.compare(label(shapeOf(a)), label(shapeOf(b))));
}

export interface ColorGroup {
  color: GemColorDef;
  count: number;
}

/**
 * Colours that actually have gems behind them, in the order of `colors` (the
 * order the team set in the back office).
 *
 * Derived for the same reason as {@link shapesInCatalog}: a swatch can never
 * land on an empty result page.
 */
export function colorsInCatalog(list: Product[], colors: GemColorDef[]): ColorGroup[] {
  const groups: ColorGroup[] = [];
  for (const color of colors) {
    const count = list.filter((p) => p.color === color.slug).length;
    if (count > 0) groups.push({ color, count });
  }
  return groups;
}
