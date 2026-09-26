import type { Localized } from "./types";
import type { GemColor, GemShape } from "./products";
import { photo } from "../lib/images";
import { combinations, comboKey, comboName, type GemOptionKey } from "../lib/gemOptions";

/**
 * Admin catalogue model, and the mock catalogue behind the prototype.
 *
 * The admin screens only ever read the types declared here and call the store
 * in `lib/adminCatalog.tsx`. With Supabase configured the store loads and saves
 * these types through `lib/adminCatalogSupabase.tsx` (mapping in
 * `lib/adminCatalogMapping.ts`); without it, it runs on the fixtures below.
 *
 * Prices are major units in the UI only. The Supabase mapping converts them to
 * integer cents and sends exact decimal strings, so no float reaches the
 * database (see `lib/catalog/money.ts`).
 */

/**
 * Lifecycle of a product. Deliberately three values, not four: "out of stock"
 * is an inventory fact, not a lifecycle state, and storing it as a status makes
 * restocking a status change. `displayState()` recombines the two for the badge
 * that has to say everything at once.
 */
export type ProductStatus = "active" | "draft" | "archived";

/** What the customer receives. Drives nothing but presentation in the prototype. */
export type ProductType = "single" | "set" | "kit" | "tool" | "care" | "course-material";

/**
 * A category key: one of the fixture slugs below in the mock catalogue, the
 * category's uuid when the catalogue comes from Supabase.
 */
export type CategoryId = string;

/** Availability when `trackInventory` is off — a made-to-order piece has no count. */
export type Availability = "in_stock" | "out_of_stock" | "preorder";

export interface Category {
  id: CategoryId;
  /** Stable key ("gems"…). The mock uses it as the id too. */
  slug?: string;
  name: Localized;
  description: Localized;
}

/** One pack × stone-size combination of a gem, with its own price and stock. */
export interface GemOptionVariant {
  pack: number | null;
  ss: number | null;
  /** EUR; undefined = the product price applies. */
  price?: number;
  trackInventory: boolean;
  stock: number;
  lowStockThreshold: number;
}

/**
 * Pack (20/50/100) × stone size (SS) options of a gem (`lib/gemOptions.ts`).
 *
 * `enabled` off with the product still carrying options means "remove them
 * on save". `variants` keeps every combination ever loaded or typed, so
 * unticking a pack then ticking it again gives its price and stock back; only
 * the combinations of the ticked packs × sizes are saved.
 */
/**
 * Stock of one sellable variant, as the product list shows it under its
 * product. Only active variants appear: an option removed after being ordered
 * is no longer sold, so it cannot run out.
 */
export interface VariantStock {
  /**
   * `comboKey()` of a pack/SS option — what the edit form's grid is keyed
   * by, so a link can open the form on that option — or the variant id.
   */
  key: string;
  /** True for a pack/SS option, the only kind the edit form can change. */
  gemOption: boolean;
  name: Localized;
  sku?: string;
  /** EUR; undefined = the product price applies. */
  price?: number;
  trackInventory: boolean;
  /** Units on the shelf. */
  stock: number;
  /** Units held by unpaid orders; the shop sells `stock - reserved`. */
  reserved?: number;
  lowStockThreshold: number;
  availability: Availability;
}

export interface GemOptions {
  enabled: boolean;
  packs: number[];
  sizes: number[];
  variants: GemOptionVariant[];
}

export interface ProductImage {
  id: string;
  /** Resolved asset URL, ready for an `<img>`. */
  src: string;
  /**
   * Object path in the `product-media` bucket when the image is stored in
   * Supabase. Absent for the mock catalogue's bundled photographs.
   */
  storagePath?: string;
  alt: Localized;
}

export interface AdminProduct {
  id: string;
  sku: string;
  name: Localized;
  shortDescription: Localized;
  description: Localized;
  categoryId: CategoryId;
  type: ProductType;
  /** EUR, as typed in the form. See the file note on monetary values. */
  price: number;
  compareAtPrice?: number;
  promoPrice?: number;
  media: ProductImage[];
  trackInventory: boolean;
  /** Meaningful only while `trackInventory` is on. */
  stock: number;
  /** Units held by unpaid orders; the shop sells `stock - reserved`. */
  reserved?: number;
  lowStockThreshold: number;
  /** Manual availability, used when `trackInventory` is off. */
  availability: Availability;
  status: ProductStatus;
  /**
   * Number of variants in the database. A product with variants keeps its stock
   * on each variant: `stock` is then their total, shown read-only, and saving
   * the product never writes it.
   */
  variantCount?: number;
  /**
   * Stock of each active variant. With variants, the product's own stock
   * state is read from these (`stockState()`), never from the total.
   */
  variantStock?: VariantStock[];
  /**
   * Pack × stone-size options. Undefined when the product has none and the
   * editor was never switched on, or when its variants are another kind
   * (colours, boxes…) that this form does not edit.
   */
  gemOptions?: GemOptions;
  /** Has variants (active or not) that are not pack/SS options: the form leaves them alone. */
  otherVariants?: boolean;
  material: Localized;
  /** Gem cut and colour family, feeding the storefront's shape and colour filters. Gems only. */
  shape?: GemShape;
  color?: GemColor;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "gems",
    name: { fr: "Gems", en: "Gems" },
    description: {
      fr: "Cristaux, charms, étoiles et pièces décoratives posées sur l’émail.",
      en: "Crystals, charms, stars and decorative pieces set on enamel.",
    },
  },
  {
    id: "kits",
    name: { fr: "Kits d’application", en: "Application kits" },
    description: {
      fr: "Coffrets complets de pose, du mordançage à la photopolymérisation.",
      en: "Complete application sets, from etching to light curing.",
    },
  },
  {
    id: "tools",
    name: { fr: "Outils", en: "Tools" },
    description: {
      fr: "Instruments de pose et de dépose à usage professionnel.",
      en: "Professional application and removal instruments.",
    },
  },
  {
    id: "aftercare",
    name: { fr: "Suivi & entretien", en: "Aftercare" },
    description: {
      fr: "Gels, brosses et produits de nettoyage pour la tenue dans la durée.",
      en: "Gels, brushes and cleaning products for long-term wear.",
    },
  },
  {
    id: "accessories",
    name: { fr: "Accessoires", en: "Accessories" },
    description: {
      fr: "Rangement, présentation et consommables de studio.",
      en: "Storage, display and studio consumables.",
    },
  },
];

/** Fixture category. Screens reading the live catalogue use `useAdminCatalog().categoryById`. */
export function categoryById(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}

/**
 * The library the media picker offers instead of a real upload. Every entry is
 * an existing brand photograph, so a product built in the prototype still looks
 * like a Global Toothgems product.
 */
export const MEDIA_LIBRARY: { file: string; alt: Localized }[] = [
  { file: "img-01.jpg", alt: { fr: "Gem cristal sur fond clair", en: "Crystal gem on a light background" } },
  { file: "img-02.jpg", alt: { fr: "Assortiment de gems", en: "Assortment of gems" } },
  { file: "img-04.jpg", alt: { fr: "Charm cœur en or", en: "Gold heart charm" } },
  { file: "img-05.jpg", alt: { fr: "Gems en présentoir", en: "Gems on a display tray" } },
  { file: "img-06.jpg", alt: { fr: "Cristaux en vrac", en: "Loose crystals" } },
  { file: "img-07.jpg", alt: { fr: "Gem de profil", en: "Gem, side view" } },
  { file: "img-08.jpg", alt: { fr: "Outils de pose", en: "Application tools" } },
  { file: "img-09.jpg", alt: { fr: "Kit de pose ouvert", en: "Open application kit" } },
  { file: "img-11.jpg", alt: { fr: "Sélection de gems colorées", en: "Selection of coloured gems" } },
  { file: "img-12.jpg", alt: { fr: "Étoile dorée en gros plan", en: "Gold star, close-up" } },
  { file: "img-13.jpg", alt: { fr: "Flacon de soin", en: "Aftercare bottle" } },
  { file: "img-14.jpg", alt: { fr: "Plan de travail studio", en: "Studio work surface" } },
  { file: "img-15.jpg", alt: { fr: "Gems en capsule stérile", en: "Gems in a sterile capsule" } },
  { file: "img-17.jpg", alt: { fr: "Charm chrome", en: "Chrome charm" } },
  { file: "img-18.jpg", alt: { fr: "Mini collection de cristaux", en: "Mini crystal collection" } },
  { file: "img-19.jpg", alt: { fr: "Brosse d’entretien", en: "Care brush" } },
  { file: "img-20.jpg", alt: { fr: "Boîte de rangement", en: "Storage box" } },
  { file: "mouth-01.jpg", alt: { fr: "Gem posée, sourire", en: "Applied gem, smile" } },
  { file: "mouth-02.jpg", alt: { fr: "Gem posée sur dent", en: "Gem applied on a tooth" } },
  { file: "mouth-03.jpg", alt: { fr: "Pose multiple", en: "Multiple application" } },
  { file: "mouth-04.jpg", alt: { fr: "Rendu lumière naturelle", en: "Natural light result" } },
  { file: "mouth-05.jpg", alt: { fr: "Détail de pose", en: "Application detail" } },
];

let mediaSeq = 0;
/** Media entries need stable ids for reordering; the library is keyed by file. */
function media(file: string): ProductImage {
  const entry = MEDIA_LIBRARY.find((m) => m.file === file);
  return {
    id: `media-${++mediaSeq}`,
    src: photo(file),
    alt: entry?.alt ?? { fr: "", en: "" },
  };
}

/** Builds a media entry for a file chosen in the picker, with a fresh id. */
export function mediaFromLibrary(file: string): ProductImage {
  return media(file);
}

const PRODUCT_FIXTURES: AdminProduct[] = [
  {
    id: "crystal-star",
    sku: "GEM-STAR-001",
    name: { fr: "Étoile Cristal", en: "Crystal Star Tooth Gem" },
    shortDescription: {
      fr: "Étoile cinq branches en cristal taillé, 2,2 mm.",
      en: "Five-point cut-crystal star, 2.2mm.",
    },
    description: {
      fr: "Étoile cinq branches en cristal taillé à dos plat, calibrée 2,2 mm pour les incisives latérales. Bords polis, livrée en capsule stérile à usage unique.",
      en: "Five-point cut-crystal star with a flat back, calibrated at 2.2mm for lateral incisors. Polished edges, delivered in a single-use sterile capsule.",
    },
    categoryId: "gems",
    type: "single",
    price: 32,
    compareAtPrice: 38,
    media: [media("img-12.jpg"), media("img-11.jpg"), media("mouth-02.jpg")],
    trackInventory: true,
    stock: 148,
    lowStockThreshold: 20,
    availability: "in_stock",
    status: "active",
    // Packs × sizes, one of them sold out and one running low, so the
    // prototype shows what the list does with an option that needs restocking.
    gemOptions: {
      enabled: true,
      packs: [20, 50],
      sizes: [6, 7],
      variants: [
        { pack: 20, ss: 6, trackInventory: true, stock: 64, lowStockThreshold: 10 },
        { pack: 20, ss: 7, trackInventory: true, stock: 52, lowStockThreshold: 10 },
        { pack: 50, ss: 6, price: 72, trackInventory: true, stock: 0, lowStockThreshold: 5 },
        { pack: 50, ss: 7, price: 72, trackInventory: true, stock: 3, lowStockThreshold: 5 },
      ],
    },
    material: { fr: "Cristal taillé", en: "Cut crystal" },
    tags: ["best-seller", "étoile"],
    createdAt: "2026-02-11T09:20:00Z",
    updatedAt: "2026-09-12T14:05:00Z",
  },
  {
    id: "swarovski-set",
    sku: "GEM-SET-012",
    name: { fr: "Coffret Cristaux Swarovski", en: "Swarovski Crystal Set" },
    shortDescription: {
      fr: "Douze cristaux Swarovski, tailles et couleurs assorties.",
      en: "Twelve Swarovski crystals, assorted sizes and colours.",
    },
    description: {
      fr: "Douze cristaux Swarovski authentiques répartis en trois calibres et quatre teintes. Présentation en plaque alvéolée, idéale pour un studio qui propose un choix en cabine.",
      en: "Twelve authentic Swarovski crystals across three calibres and four shades. Presented in a compartment tray, ideal for a studio offering a chairside choice.",
    },
    categoryId: "gems",
    type: "set",
    price: 119,
    media: [media("img-11.jpg"), media("img-05.jpg"), media("img-02.jpg")],
    trackInventory: true,
    stock: 24,
    lowStockThreshold: 10,
    availability: "in_stock",
    status: "active",
    material: { fr: "Cristal Swarovski", en: "Swarovski crystal" },
    tags: ["pro", "coffret"],
    createdAt: "2026-01-28T11:00:00Z",
    updatedAt: "2026-09-15T08:42:00Z",
  },
  {
    id: "gold-star-charm",
    sku: "GEM-GOLD-004",
    name: { fr: "Charm Étoile Or 18k", en: "18K Gold Star Charm" },
    shortDescription: {
      fr: "Étoile massive en or 18 carats, 2,0 mm.",
      en: "Solid 18-carat gold star, 2.0mm.",
    },
    description: {
      fr: "Étoile massive en or 18 carats, sans placage. Dos plat rainuré pour l’adhésif, finition miroir. Pièce signature de la collection or.",
      en: "Solid 18-carat gold star, no plating. Grooved flat back for adhesive, mirror finish. Signature piece of the gold collection.",
    },
    categoryId: "gems",
    type: "single",
    price: 89,
    media: [media("img-12.jpg"), media("img-07.jpg")],
    trackInventory: true,
    stock: 7,
    lowStockThreshold: 12,
    availability: "in_stock",
    status: "active",
    material: { fr: "Or 18 carats", en: "18-carat gold" },
    tags: ["or", "signature"],
    createdAt: "2025-11-04T15:30:00Z",
    updatedAt: "2026-09-16T17:10:00Z",
  },
  {
    id: "chrome-heart",
    sku: "GEM-CHR-007",
    name: { fr: "Cœur Chrome", en: "Chrome Heart Tooth Gem" },
    shortDescription: {
      fr: "Cœur chromé effet miroir, 1,8 mm.",
      en: "Mirror-finish chrome heart, 1.8mm.",
    },
    description: {
      fr: "Cœur chromé à effet miroir, calibre discret de 1,8 mm. Rendu métallique franc, très photogénique en lumière de studio.",
      en: "Mirror-finish chrome heart in a discreet 1.8mm calibre. Bold metallic look, highly photogenic under studio light.",
    },
    categoryId: "gems",
    type: "single",
    price: 41,
    media: [media("img-17.jpg"), media("mouth-03.jpg")],
    trackInventory: true,
    stock: 0,
    lowStockThreshold: 15,
    availability: "in_stock",
    status: "active",
    material: { fr: "Laiton chromé", en: "Chrome-plated brass" },
    tags: ["chrome", "alt"],
    createdAt: "2026-03-19T10:15:00Z",
    updatedAt: "2026-09-14T09:00:00Z",
  },
  {
    id: "application-kit-pro",
    sku: "KIT-PRO-001",
    name: { fr: "Kit d’Application Premium", en: "Premium Application Kit" },
    shortDescription: {
      fr: "Coffret complet de pose professionnelle, 14 pièces.",
      en: "Complete professional application set, 14 pieces.",
    },
    description: {
      fr: "Coffret complet de pose professionnelle : mordançage, adhésif photopolymérisable, lampe LED, écarteur, pinces de préhension et consommables pour environ quarante poses.",
      en: "Complete professional application set: etchant, light-cured adhesive, LED lamp, retractor, gripping tweezers and consumables for roughly forty applications.",
    },
    categoryId: "kits",
    type: "kit",
    price: 249,
    compareAtPrice: 289,
    promoPrice: 219,
    media: [media("img-09.jpg"), media("img-08.jpg"), media("img-14.jpg")],
    trackInventory: true,
    stock: 31,
    lowStockThreshold: 8,
    availability: "in_stock",
    status: "active",
    material: { fr: "Coffret 14 pièces", en: "14-piece set" },
    tags: ["pro", "kit", "promo"],
    createdAt: "2025-09-22T08:00:00Z",
    updatedAt: "2026-09-16T11:25:00Z",
  },
  {
    id: "starter-kit",
    sku: "KIT-START-002",
    name: { fr: "Kit Découverte", en: "Starter Application Kit" },
    shortDescription: {
      fr: "Format d’entrée de gamme pour une première pose encadrée.",
      en: "Entry-level format for a first supervised application.",
    },
    description: {
      fr: "Version condensée du kit premium, pensée pour les élèves de l’Academy : de quoi réaliser une dizaine de poses en conditions d’atelier.",
      en: "Condensed version of the premium kit, built for Academy students: enough for around ten applications in workshop conditions.",
    },
    categoryId: "kits",
    type: "kit",
    price: 129,
    media: [media("img-09.jpg"), media("img-14.jpg")],
    trackInventory: true,
    stock: 62,
    lowStockThreshold: 15,
    availability: "in_stock",
    status: "draft",
    material: { fr: "Coffret 8 pièces", en: "8-piece set" },
    tags: ["academy", "kit"],
    createdAt: "2026-08-30T13:45:00Z",
    updatedAt: "2026-09-16T16:20:00Z",
  },
  {
    id: "aftercare-gel",
    sku: "CARE-GEL-003",
    name: { fr: "Gel de Suivi", en: "Tooth Gem Aftercare Gel" },
    shortDescription: {
      fr: "Gel reminéralisant sans fluor, 30 ml.",
      en: "Fluoride-free remineralising gel, 30ml.",
    },
    description: {
      fr: "Gel reminéralisant sans fluor à appliquer autour de la gem, formulé pour ne pas attaquer l’adhésif. Flacon 30 ml, environ deux mois d’utilisation quotidienne.",
      en: "Fluoride-free remineralising gel applied around the gem, formulated not to attack the adhesive. 30ml bottle, roughly two months of daily use.",
    },
    categoryId: "aftercare",
    type: "care",
    price: 19,
    media: [media("img-13.jpg")],
    trackInventory: true,
    stock: 11,
    lowStockThreshold: 25,
    availability: "in_stock",
    status: "active",
    material: { fr: "Flacon 30 ml", en: "30ml bottle" },
    tags: ["suivi", "réachat"],
    createdAt: "2026-04-02T07:50:00Z",
    updatedAt: "2026-09-10T12:00:00Z",
  },
  {
    id: "care-brush",
    sku: "CARE-BRS-006",
    name: { fr: "Brosse Interdentaire Gem", en: "Gem Interdental Brush" },
    shortDescription: {
      fr: "Brosse souple pour le contour de la gem, lot de trois.",
      en: "Soft brush for the gem contour, pack of three.",
    },
    description: {
      fr: "Brosse à filaments souples conçue pour nettoyer le pourtour de la pierre sans décoller l’adhésif. Vendue par lot de trois, à remplacer tous les deux mois.",
      en: "Soft-filament brush designed to clean around the stone without lifting the adhesive. Sold in packs of three, replaced every two months.",
    },
    categoryId: "aftercare",
    type: "care",
    price: 12,
    media: [media("img-19.jpg")],
    trackInventory: true,
    stock: 204,
    lowStockThreshold: 40,
    availability: "in_stock",
    status: "active",
    material: { fr: "Lot de 3", en: "Pack of 3" },
    tags: ["suivi"],
    createdAt: "2026-04-02T07:55:00Z",
    updatedAt: "2026-08-28T10:30:00Z",
  },
  {
    id: "mini-crystal-collection",
    sku: "GEM-MINI-021",
    name: { fr: "Mini Collection Cristaux", en: "Mini Crystal Collection" },
    shortDescription: {
      fr: "Six micro-cristaux 1,5 mm pour poses discrètes.",
      en: "Six 1.5mm micro-crystals for discreet applications.",
    },
    description: {
      fr: "Six micro-cristaux de 1,5 mm en teintes neutres, pensés pour les poses discrètes et les alignements multiples sur une même dent.",
      en: "Six 1.5mm micro-crystals in neutral shades, made for discreet applications and multi-stone alignments on a single tooth.",
    },
    categoryId: "gems",
    type: "set",
    price: 54,
    media: [media("img-18.jpg"), media("img-06.jpg")],
    trackInventory: true,
    stock: 18,
    lowStockThreshold: 20,
    availability: "in_stock",
    status: "active",
    material: { fr: "Cristal taillé", en: "Cut crystal" },
    tags: ["mini", "coffret"],
    createdAt: "2026-06-14T16:00:00Z",
    updatedAt: "2026-09-13T15:45:00Z",
  },
  {
    id: "opal-drop",
    sku: "GEM-OPL-015",
    name: { fr: "Goutte Opale", en: "Opal Drop Gem" },
    shortDescription: {
      fr: "Goutte en opale de laboratoire, reflets changeants.",
      en: "Lab-grown opal drop with shifting reflections.",
    },
    description: {
      fr: "Goutte en opale de laboratoire aux reflets changeants selon l’angle. Pièce d’édition limitée, fabriquée par lots de cinquante.",
      en: "Lab-grown opal drop whose reflections shift with the angle. Limited edition piece, produced in batches of fifty.",
    },
    categoryId: "gems",
    type: "single",
    price: 64,
    media: [media("img-01.jpg"), media("mouth-04.jpg")],
    trackInventory: false,
    stock: 0,
    lowStockThreshold: 10,
    availability: "preorder",
    status: "active",
    material: { fr: "Opale de laboratoire", en: "Lab-grown opal" },
    tags: ["édition limitée"],
    createdAt: "2026-07-08T09:10:00Z",
    updatedAt: "2026-09-09T08:20:00Z",
  },
  {
    id: "removal-pliers",
    sku: "TOOL-REM-002",
    name: { fr: "Pince de Dépose", en: "Gem Removal Pliers" },
    shortDescription: {
      fr: "Pince acier chirurgical pour dépose sans éclat d’émail.",
      en: "Surgical-steel pliers for chip-free removal.",
    },
    description: {
      fr: "Pince en acier chirurgical à mors profilés, conçue pour une dépose sans éclat d’émail. Stérilisable en autoclave, réservée à un usage professionnel.",
      en: "Surgical-steel pliers with profiled jaws, designed for chip-free removal. Autoclave-sterilisable, professional use only.",
    },
    categoryId: "tools",
    type: "tool",
    price: 78,
    media: [media("img-08.jpg")],
    trackInventory: true,
    stock: 9,
    lowStockThreshold: 10,
    availability: "in_stock",
    status: "active",
    material: { fr: "Acier chirurgical", en: "Surgical steel" },
    tags: ["pro", "outil"],
    createdAt: "2025-10-17T14:00:00Z",
    updatedAt: "2026-09-05T13:15:00Z",
  },
  {
    id: "curing-lamp",
    sku: "TOOL-LMP-005",
    name: { fr: "Lampe LED de Polymérisation", en: "LED Curing Lamp" },
    shortDescription: {
      fr: "Lampe sans fil 1200 mW/cm², trois modes.",
      en: "Cordless 1200 mW/cm² lamp, three modes.",
    },
    description: {
      fr: "Lampe LED sans fil de 1200 mW/cm² avec trois modes de polymérisation. Autonomie d’environ trois cents cycles, chargeur secteur inclus.",
      en: "Cordless 1200 mW/cm² LED lamp with three curing modes. Around three hundred cycles per charge, mains charger included.",
    },
    categoryId: "tools",
    type: "tool",
    price: 165,
    media: [media("img-08.jpg"), media("img-14.jpg")],
    trackInventory: true,
    stock: 0,
    lowStockThreshold: 5,
    availability: "out_of_stock",
    status: "draft",
    material: { fr: "Sans fil, 1200 mW/cm²", en: "Cordless, 1200 mW/cm²" },
    tags: ["outil", "équipement"],
    createdAt: "2026-09-01T10:40:00Z",
    updatedAt: "2026-09-16T09:05:00Z",
  },
  {
    id: "display-tray",
    sku: "ACC-TRY-001",
    name: { fr: "Présentoir de Studio", en: "Studio Display Tray" },
    shortDescription: {
      fr: "Plateau velours douze emplacements pour le choix en cabine.",
      en: "Twelve-slot velvet tray for chairside selection.",
    },
    description: {
      fr: "Plateau en velours à douze emplacements, pensé pour présenter les pierres au client avant la pose. Se range dans un tiroir standard.",
      en: "Twelve-slot velvet tray, made to present stones to the client before application. Fits a standard drawer.",
    },
    categoryId: "accessories",
    type: "tool",
    price: 45,
    media: [media("img-05.jpg"), media("img-20.jpg")],
    trackInventory: true,
    stock: 37,
    lowStockThreshold: 10,
    availability: "in_stock",
    status: "active",
    material: { fr: "Velours et bois", en: "Velvet and wood" },
    tags: ["studio"],
    createdAt: "2026-05-21T11:20:00Z",
    updatedAt: "2026-07-30T14:50:00Z",
  },
  {
    id: "sterile-capsules",
    sku: "ACC-CAP-009",
    name: { fr: "Capsules Stériles", en: "Sterile Capsules" },
    shortDescription: {
      fr: "Capsules à usage unique, boîte de cent.",
      en: "Single-use capsules, box of one hundred.",
    },
    description: {
      fr: "Capsules à usage unique pour le conditionnement individuel des pierres. Boîte de cent, consommable de studio.",
      en: "Single-use capsules for individual stone packaging. Box of one hundred, studio consumable.",
    },
    categoryId: "accessories",
    type: "care",
    price: 24,
    media: [media("img-15.jpg")],
    trackInventory: true,
    stock: 3,
    lowStockThreshold: 30,
    availability: "in_stock",
    status: "active",
    material: { fr: "Boîte de 100", en: "Box of 100" },
    tags: ["consommable", "studio"],
    createdAt: "2026-02-02T09:00:00Z",
    updatedAt: "2026-09-16T18:30:00Z",
  },
  {
    id: "chrome-cross",
    sku: "GEM-CHR-011",
    name: { fr: "Croix Chrome", en: "Chrome Cross Charm" },
    shortDescription: {
      fr: "Croix chromée, ancienne collection.",
      en: "Chrome cross, previous collection.",
    },
    description: {
      fr: "Croix chromée de la collection automne 2025. Retirée du catalogue après l’épuisement du dernier lot de fabrication.",
      en: "Chrome cross from the autumn 2025 collection. Withdrawn from the catalogue once the final production batch sold out.",
    },
    categoryId: "gems",
    type: "single",
    price: 38,
    media: [media("img-17.jpg")],
    trackInventory: true,
    stock: 0,
    lowStockThreshold: 10,
    availability: "out_of_stock",
    status: "archived",
    material: { fr: "Laiton chromé", en: "Chrome-plated brass" },
    tags: ["chrome", "archive"],
    createdAt: "2025-08-12T10:00:00Z",
    updatedAt: "2026-06-18T16:00:00Z",
  },
  {
    id: "glitter-set-2025",
    sku: "GEM-SET-004",
    name: { fr: "Coffret Glitter 2025", en: "Glitter Set 2025" },
    shortDescription: {
      fr: "Coffret saisonnier, fin de vie commerciale.",
      en: "Seasonal set, end of commercial life.",
    },
    description: {
      fr: "Coffret saisonnier de huit pierres à effet pailleté. Archivé : la teinte n’est plus produite par le fournisseur.",
      en: "Seasonal set of eight glitter-effect stones. Archived: the shade is no longer produced by the supplier.",
    },
    categoryId: "gems",
    type: "set",
    price: 72,
    compareAtPrice: 88,
    media: [media("img-02.jpg"), media("img-06.jpg")],
    trackInventory: true,
    stock: 2,
    lowStockThreshold: 10,
    availability: "in_stock",
    status: "archived",
    material: { fr: "Cristal pailleté", en: "Glitter crystal" },
    tags: ["saison", "archive"],
    createdAt: "2025-06-30T08:30:00Z",
    updatedAt: "2026-05-02T09:45:00Z",
  },
];

/**
 * The prototype catalogue. Fixtures with pack/SS options get their stock
 * derived here, as the store does on every save, so every reader of this
 * list (analytics included) sees the same per-option stock.
 */
export const ADMIN_PRODUCTS: AdminProduct[] = PRODUCT_FIXTURES.map(withGemStock);

/**
 * What the badge shows when one label has to carry the whole story. Order
 * matters: an archived product that happens to be out of stock is archived
 * first, and a live product with no stock is what an administrator must see.
 */
export type DisplayState = "active" | "draft" | "archived" | "out_of_stock" | "low_stock";

export function displayState(product: AdminProduct): DisplayState {
  if (product.status === "archived") return "archived";
  if (product.status === "draft") return "draft";
  if (stockState(product) === "out_of_stock") return "out_of_stock";
  if (stockState(product) === "low_stock") return "low_stock";
  return "active";
}

export type StockState = "in_stock" | "low_stock" | "out_of_stock" | "preorder";

/** What `inventoryState()` needs: a product without variants, or one variant. */
type Inventory = Pick<VariantStock, "trackInventory" | "stock" | "reserved" | "lowStockThreshold" | "availability">;

/**
 * State of one stock row: from the count when inventory is tracked, from the
 * manual field when it is not. Same rule as the database's generated
 * `inventory_items.stock_status`, so the admin and the shop agree on what is
 * sold out: units held by unpaid orders are not for sale.
 */
export function inventoryState(item: Inventory): StockState {
  if (!item.trackInventory) {
    return item.availability === "preorder"
      ? "preorder"
      : item.availability === "out_of_stock"
        ? "out_of_stock"
        : "in_stock";
  }
  const available = item.stock - (item.reserved ?? 0);
  if (available <= 0) return "out_of_stock";
  if (available <= item.lowStockThreshold) return "low_stock";
  return "in_stock";
}

/**
 * Availability of a product. Every stock reading in the admin goes through
 * here, so the two modes can never disagree on screen.
 *
 * With variants, the total says nothing (six options at 100 hide a seventh
 * at 0), so the variants decide, as in the statistics RPC
 * (`…_admin_statistics.sql`): out of stock only when every one is, low as
 * soon as one is low or out — the product still sells, but something needs
 * restocking.
 */
export function stockState(product: AdminProduct): StockState {
  const variants = product.variantStock;
  if (variants && variants.length > 0) {
    const states = variants.map(inventoryState);
    if (states.every((s) => s === "out_of_stock")) return "out_of_stock";
    if (states.some((s) => s === "out_of_stock" || s === "low_stock")) return "low_stock";
    if (states.every((s) => s === "preorder")) return "preorder";
    return "in_stock";
  }
  return inventoryState(product);
}

/** The variants that need restocking: sold out first, then low, list order kept. */
export function variantAlerts(product: AdminProduct): (VariantStock & { state: "out_of_stock" | "low_stock" })[] {
  const rank = { out_of_stock: 0, low_stock: 1 } as const;
  return (product.variantStock ?? [])
    .map((variant) => ({ ...variant, state: inventoryState(variant) }))
    .filter((v): v is VariantStock & { state: "out_of_stock" | "low_stock" } =>
      v.state === "out_of_stock" || v.state === "low_stock",
    )
    .sort((a, b) => rank[a.state] - rank[b.state]);
}

/**
 * Whether a product belongs under an availability filter. "Out of stock" and
 * "low stock" also take a product with a single option in that state, so an
 * option that runs out can never hide behind its siblings. The filter, the
 * dashboard counts and the dashboard shortlist all use this one rule, so the
 * card's number is the length of the list it links to.
 */
export function matchesStockState(product: AdminProduct, state: StockState): boolean {
  if (stockState(product) === state) return true;
  if (state !== "out_of_stock" && state !== "low_stock") return false;
  return (product.variantStock ?? []).some((variant) => inventoryState(variant) === state);
}

/** Needs restocking: out of stock or low, the product or any of its options. */
export function needsRestock(product: AdminProduct): boolean {
  return matchesStockState(product, "out_of_stock") || matchesStockState(product, "low_stock");
}

/** Price actually charged: the promotional price wins when one is set. */
export function effectivePrice(product: AdminProduct): number {
  return product.promoPrice ?? product.price;
}

/**
 * Recommendations: products the team places next to a product. Mirrors the
 * `product_recommendations` table (`supabase/migrations/…_product_recommendations.sql`):
 * one link per (product, kind, recommended product), ordered by `position`.
 *
 * - `complementary` — goes with it: the product page's "Va avec" block and the
 *   cart suggestions;
 * - `similar` — an alternative to it (another shape, another finish).
 */
export type RecommendationKind = "complementary" | "similar";

export const RECOMMENDATION_KINDS: RecommendationKind[] = ["complementary", "similar"];

export interface ProductRecommendation {
  productId: string;
  recommendedProductId: string;
  kind: RecommendationKind;
  position: number;
}

/**
 * Places a recommendation block fills on the storefront. Matches the default
 * `p_limit` of `recommended_products()`; the links beyond it stand in when an
 * earlier one cannot be shown.
 */
export const STOREFRONT_RECOMMENDATION_SLOTS = 4;

/**
 * Whether the storefront may show a product as a recommendation right now.
 * Same rule as `recommended_products()`: on sale, and not sold out. A link to a
 * product that fails it is kept, and skipped until the product qualifies again.
 */
export function isRecommendable(product: AdminProduct): boolean {
  return product.status === "active" && stockState(product) !== "out_of_stock";
}

/** Same links as `supabase/seed.sql`, on the prototype's product ids. */
export const SEED_RECOMMENDATIONS: ProductRecommendation[] = (
  [
    ["crystal-star", "aftercare-gel", "complementary"],
    ["crystal-star", "sterile-capsules", "complementary"],
    ["crystal-star", "application-kit-pro", "complementary"],
    ["crystal-star", "removal-pliers", "complementary"],
    ["gold-star-charm", "aftercare-gel", "complementary"],
    ["gold-star-charm", "application-kit-pro", "complementary"],
    ["gold-star-charm", "sterile-capsules", "complementary"],
    ["chrome-heart", "aftercare-gel", "complementary"],
    ["chrome-heart", "sterile-capsules", "complementary"],
    ["opal-drop", "aftercare-gel", "complementary"],
    ["opal-drop", "sterile-capsules", "complementary"],
    ["application-kit-pro", "sterile-capsules", "complementary"],
    ["application-kit-pro", "crystal-star", "complementary"],
    ["application-kit-pro", "removal-pliers", "complementary"],
    ["application-kit-pro", "aftercare-gel", "complementary"],
    ["removal-pliers", "aftercare-gel", "complementary"],
    ["removal-pliers", "sterile-capsules", "complementary"],
    ["aftercare-gel", "sterile-capsules", "complementary"],
    ["sterile-capsules", "aftercare-gel", "complementary"],
    ["crystal-star", "gold-star-charm", "similar"],
    ["crystal-star", "chrome-heart", "similar"],
    ["gold-star-charm", "crystal-star", "similar"],
    ["chrome-heart", "opal-drop", "similar"],
    ["opal-drop", "chrome-heart", "similar"],
  ] as const
).map(([productId, recommendedProductId, kind], index, all) => ({
  productId,
  recommendedProductId,
  kind,
  // Position within the (product, kind) list, in the order written above.
  position: all.slice(0, index).filter(([p, , k]) => p === productId && k === kind).length,
}));

export type ActivityKind = "created" | "updated" | "archived" | "restored" | "status" | "stock" | "deleted" | "duplicated";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  productId: string;
  productName: Localized;
  /** Free-form complement, already localized at the point it is recorded. */
  detail?: Localized;
  at: string;
  actor: string;
}

export const SEED_ACTIVITY: ActivityEntry[] = [
  {
    id: "act-1",
    kind: "stock",
    productId: "sterile-capsules",
    productName: { fr: "Capsules Stériles", en: "Sterile Capsules" },
    detail: { fr: "Stock bas : 3 restantes", en: "Low stock: 3 left" },
    at: "2026-09-16T18:30:00Z",
    actor: "Camille D.",
  },
  {
    id: "act-2",
    kind: "updated",
    productId: "gold-star-charm",
    productName: { fr: "Charm Étoile Or 18k", en: "18K Gold Star Charm" },
    detail: { fr: "Prix passé à 89 €", en: "Price changed to €89" },
    at: "2026-09-16T17:10:00Z",
    actor: "Camille D.",
  },
  {
    id: "act-3",
    kind: "created",
    productId: "starter-kit",
    productName: { fr: "Kit Découverte", en: "Starter Application Kit" },
    detail: { fr: "Enregistré en brouillon", en: "Saved as a draft" },
    at: "2026-09-16T16:20:00Z",
    actor: "Camille D.",
  },
  {
    id: "act-4",
    kind: "status",
    productId: "curing-lamp",
    productName: { fr: "Lampe LED de Polymérisation", en: "LED Curing Lamp" },
    detail: { fr: "Repassée en brouillon", en: "Moved back to draft" },
    at: "2026-09-16T09:05:00Z",
    actor: "Yanis B.",
  },
  {
    id: "act-5",
    kind: "updated",
    productId: "application-kit-pro",
    productName: { fr: "Kit d’Application Premium", en: "Premium Application Kit" },
    detail: { fr: "Prix promotionnel activé", en: "Promotional price enabled" },
    at: "2026-09-16T11:25:00Z",
    actor: "Camille D.",
  },
  {
    id: "act-6",
    kind: "stock",
    productId: "chrome-heart",
    productName: { fr: "Cœur Chrome", en: "Chrome Heart Tooth Gem" },
    detail: { fr: "Rupture de stock", en: "Out of stock" },
    at: "2026-09-14T09:00:00Z",
    actor: "Système",
  },
  {
    id: "act-7",
    kind: "archived",
    productId: "chrome-cross",
    productName: { fr: "Croix Chrome", en: "Chrome Cross Charm" },
    at: "2026-06-18T16:00:00Z",
    actor: "Yanis B.",
  },
];

/** A combination that was never given values: product price, tracked, empty shelf. */
export function blankGemVariant(key: GemOptionKey): GemOptionVariant {
  return { ...key, price: undefined, trackInventory: true, stock: 0, lowStockThreshold: 5 };
}

/**
 * The combinations a product offers — ticked packs × ticked sizes, in display
 * order — each with its remembered values. Empty when the options are off.
 */
export function offeredGemVariants(options: GemOptions | undefined): GemOptionVariant[] {
  if (!options?.enabled) return [];
  const known = new Map(options.variants.map((variant) => [comboKey(variant), variant]));
  return combinations(options.packs, options.sizes).map((key) => known.get(comboKey(key)) ?? blankGemVariant(key));
}

/** The stock rows a product's pack/SS options put under it in the list. */
export function gemVariantStock(options: GemOptions | undefined): VariantStock[] {
  return offeredGemVariants(options).map((variant) => ({
    key: comboKey(variant),
    gemOption: true,
    name: comboName(variant),
    price: variant.price,
    trackInventory: variant.trackInventory,
    stock: variant.stock,
    lowStockThreshold: variant.lowStockThreshold,
    availability: "in_stock",
  }));
}

/**
 * What the prototype store does in place of the database: a product with
 * pack/SS options reads as the total of its options' stock, like
 * `rowToProduct()` does for real variants, and carries each option's stock.
 */
export function withGemStock(product: AdminProduct): AdminProduct {
  if (!product.gemOptions) return product;
  const variantStock = gemVariantStock(product.gemOptions);
  if (variantStock.length === 0) return { ...product, variantCount: 0, variantStock: undefined };
  return {
    ...product,
    variantCount: variantStock.length,
    variantStock,
    trackInventory: true,
    stock: variantStock.reduce((sum, v) => sum + v.stock, 0),
    lowStockThreshold: variantStock.reduce((sum, v) => sum + v.lowStockThreshold, 0),
  };
}
