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
  | "flower";

/** Display order of the shape carousel and of the shop filter. */
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
];

/**
 * Colour family of a gem, as an ASCII slug. It travels in the `couleur` URL
 * parameter exactly like `forme` does, so a link built in one language still
 * resolves in the other — display labels live under `shop.colors.*`.
 */
export type GemColor =
  | "crystal"
  | "aquamarine"
  | "capri"
  | "sapphire"
  | "amethyst"
  | "heliotrope"
  | "peridot"
  | "topaz"
  | "opal"
  | "gold";

/** Display order of the colour carousel and of the shop filter. */
export const GEM_COLORS: GemColor[] = [
  "crystal",
  "aquamarine",
  "capri",
  "sapphire",
  "amethyst",
  "heliotrope",
  "peridot",
  "topaz",
  "opal",
  "gold",
];

/**
 * Swatch fill per colour.
 *
 * A gradient rather than a flat hex: a crystal reads as a highlight and a
 * shadow, and a flat circle of clear crystal would be indistinguishable from a
 * disabled chip. The angle is shared so a row of swatches lines up.
 */
export const GEM_COLOR_SWATCH: Record<GemColor, string> = {
  crystal: "linear-gradient(135deg, #ffffff, #d3e0ef)",
  aquamarine: "linear-gradient(135deg, #cfeaf2, #6fb3c9)",
  capri: "linear-gradient(135deg, #7fb6e4, #1f6dab)",
  sapphire: "linear-gradient(135deg, #8fa7e8, #2b3f96)",
  amethyst: "linear-gradient(135deg, #e0cdf0, #8e6bb5)",
  heliotrope: "linear-gradient(135deg, #f2d7ef, #9bb8e6 55%, #c8a6dd)",
  peridot: "linear-gradient(135deg, #e2efb8, #8fb34a)",
  topaz: "linear-gradient(135deg, #fbe7bb, #d9a03f)",
  opal: "linear-gradient(135deg, #fdf3ec, #cfe6e2 45%, #efd3e6)",
  gold: "linear-gradient(135deg, #f7e2ac, #c8992f)",
};

export interface Product {
  id: string;
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
  cat: "Gems" | "Outils" | "Kits" | "Suivi";
  material: string;
  /** Gems only. Tools, kits and aftercare have no cut. */
  shape?: GemShape;
  /** Gems only, like `shape`. */
  color?: GemColor;
  description?: Localized;
  center?: Localized;
  gallery?: { src: string; alt: Localized }[];
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

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function bestSellers(): Product[] {
  const pool = PRODUCTS.filter((p) => p.cat === "Gems" || p.cat === "Kits")
    .slice()
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 4);
  return pool;
}

export function relatedProducts(): Product[] {
  return PRODUCTS.slice(3, 7);
}

export interface ShapeGroup {
  shape: GemShape;
  count: number;
}

/**
 * Shapes that actually have gems behind them, in `GEM_SHAPES` order.
 *
 * Derived rather than hardcoded so a shape tile can never land on an empty
 * result page: adding or removing a gem updates the carousel by itself.
 */
export function shapesInCatalog(): ShapeGroup[] {
  const groups: ShapeGroup[] = [];
  for (const shape of GEM_SHAPES) {
    const count = PRODUCTS.filter((p) => p.shape === shape).length;
    if (count > 0) groups.push({ shape, count });
  }
  return groups;
}

export interface ColorGroup {
  color: GemColor;
  count: number;
}

/**
 * Colours that actually have gems behind them, in `GEM_COLORS` order.
 *
 * Derived for the same reason as {@link shapesInCatalog}: a swatch can never
 * land on an empty result page.
 */
export function colorsInCatalog(): ColorGroup[] {
  const groups: ColorGroup[] = [];
  for (const color of GEM_COLORS) {
    const count = PRODUCTS.filter((p) => p.color === color).length;
    if (count > 0) groups.push({ color, count });
  }
  return groups;
}
