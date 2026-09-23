/**
 * Translatable content with gaps — the items behind the "Missing translations"
 * list on the Languages settings page.
 *
 * Only items that still need work are listed; the rest of the catalogue is
 * complete and counted through `CATALOGUE_FIELDS`. Source text is English (see
 * `SOURCE_LANGUAGE`). Per language, a record is either `"complete"` or a map of
 * the fields that exist in that language: a field absent from the map is
 * missing, and a field marked `outdated` was translated before the English
 * source last changed.
 */

export type TrContentType = "product" | "category" | "module" | "email" | "content";
export const TR_CONTENT_TYPES: TrContentType[] = ["product", "category", "module", "email", "content"];

/** Coverage is also reported for the storefront interface, which has no gaps today. */
export type CoverageArea = "storefront" | TrContentType;
export const COVERAGE_AREAS: CoverageArea[] = ["storefront", "product", "category", "module", "email", "content"];

export type TrFieldKind =
  | "name"
  | "shortDescription"
  | "description"
  | "seoTitle"
  | "title"
  | "summary"
  | "objectives"
  | "subject"
  | "preheader"
  | "body";

export interface TrField {
  key: TrFieldKind;
  source: string;
  multiline?: boolean;
}

export interface TrValue {
  value: string;
  outdated?: boolean;
}

export type TrLangRecord = "complete" | Partial<Record<TrFieldKind, TrValue>>;

export type TrPriority = "high" | "normal" | "low";

export interface TrItem {
  id: string;
  type: TrContentType;
  name: string;
  /** Where it lives — a SKU, a course, a trigger. */
  context: string;
  priority: TrPriority;
  /** ISO date the English source was last edited. */
  updatedAt: string;
  fields: TrField[];
  translations: Record<string, TrLangRecord>;
}

/**
 * Translatable fields per language across the whole catalogue, complete items
 * included. Coverage is `(fields − missing) / fields`.
 */
export const CATALOGUE_FIELDS: Record<CoverageArea, number> = {
  storefront: 60,
  product: 110,
  category: 36,
  module: 45,
  email: 27,
  content: 22,
};

/**
 * Languages the translation records cover. A language enabled later (say
 * Portuguese) has nothing translated yet: it reads 0 % and is not itemised
 * field by field until work on it starts.
 */
export const TRACKED_LANGUAGES = ["fr", "it", "de", "es"];

const C = "complete" as const;

const product = (name: string, short: string, description: string, seo: string): TrField[] => [
  { key: "name", source: name },
  { key: "shortDescription", source: short },
  { key: "description", source: description, multiline: true },
  { key: "seoTitle", source: seo },
];
const category = (name: string, description: string, seo: string): TrField[] => [
  { key: "name", source: name },
  { key: "description", source: description, multiline: true },
  { key: "seoTitle", source: seo },
];
const module = (title: string, summary: string, objectives: string): TrField[] => [
  { key: "title", source: title },
  { key: "summary", source: summary, multiline: true },
  { key: "objectives", source: objectives, multiline: true },
];
const email = (subject: string, preheader: string, body: string): TrField[] => [
  { key: "subject", source: subject },
  { key: "preheader", source: preheader },
  { key: "body", source: body, multiline: true },
];

export const TRANSLATION_ITEMS: TrItem[] = [
  /* Products ------------------------------------------------------------- */
  {
    id: "p-crystal-kit",
    type: "product",
    name: "Crystal Tooth Gems Kit",
    context: "Kits · GT-KIT-CRY",
    priority: "high",
    updatedAt: "2026-09-21",
    fields: product(
      "Crystal Tooth Gems Kit",
      "Premium crystal tooth gems in 12 cuts, ready for professional application.",
      "Premium crystal tooth gems designed for a brilliant, long-lasting sparkle. The kit contains 60 lead-free crystals in 12 cuts and sizes, sorted in a reusable magnetic case.",
      "Crystal Tooth Gems Kit — 60 professional crystals",
    ),
    translations: { fr: C },
  },
  {
    id: "p-diamond-clear",
    type: "product",
    name: "Diamond Shape Gem — Clear",
    context: "Crystals · GT-CRY-DIA-02",
    priority: "normal",
    updatedAt: "2026-09-12",
    fields: product(
      "Diamond Shape Gem — Clear",
      "A faceted diamond-shape crystal with a bright, clean sparkle.",
      "Our best-selling cut. A 2 mm faceted crystal with a flat, etched back for a secure bond. Sold by 10.",
      "Clear diamond tooth gem 2 mm — pack of 10",
    ),
    translations: {
      fr: C,
      it: C,
      de: {
        name: { value: "Diamantform-Stein — Klar" },
        shortDescription: { value: "Ein facettierter Kristall in Diamantform mit hellem, klarem Funkeln." },
      },
    },
  },
  {
    id: "p-heart-rose",
    type: "product",
    name: "Heart Gem 3 mm — Rose",
    context: "Crystals · GT-CRY-HRT-03",
    priority: "normal",
    updatedAt: "2026-09-05",
    fields: product(
      "Heart Gem 3 mm — Rose",
      "A soft rose heart, cut to catch the light from every angle.",
      "A 3 mm heart-shaped crystal in a soft rose tone. Lead-free, with a flat back prepared for dental-grade adhesive.",
      "Rose heart tooth gem 3 mm",
    ),
    translations: {
      fr: C,
      it: C,
      es: {
        name: { value: "Gema corazón 3 mm — Rosa" },
        shortDescription: { value: "Un corazón rosa suave, tallado para captar la luz desde todos los ángulos." },
        description: {
          value: "Un cristal en forma de corazón de 3 mm en un tono rosa suave. Sin plomo, con base plana preparada para adhesivo dental.",
        },
      },
    },
  },
  {
    id: "p-gold-star",
    type: "product",
    name: "Gold Star Charm 18k",
    context: "Gold charms · GT-GLD-STR",
    priority: "high",
    updatedAt: "2026-09-18",
    fields: product(
      "Gold Star Charm 18k",
      "A solid 18k gold star, hand-finished in France.",
      "A solid 18k yellow gold star charm, 2.5 mm, hand-finished in our partner workshop in France. Supplied with a certificate of authenticity.",
      "18k gold star tooth charm — solid gold",
    ),
    translations: {
      fr: {
        name: { value: "Charm étoile or 18 carats" },
        shortDescription: { value: "Une étoile en or massif 18 carats, finie à la main en France." },
        description: {
          value: "Un charm étoile en or jaune 18 carats massif, finition main. Livré avec un certificat d'authenticité.",
          outdated: true,
        },
        seoTitle: { value: "Charm dentaire étoile or 18 carats — or massif" },
      },
      it: C,
      de: C,
    },
  },
  {
    id: "p-bond-adhesive",
    type: "product",
    name: "Pro Bonding Adhesive 2 ml",
    context: "Adhesives · GT-ADH-PRO",
    priority: "high",
    updatedAt: "2026-09-16",
    fields: product(
      "Pro Bonding Adhesive 2 ml",
      "Light-cure, dental-grade adhesive for secure, gentle bonding.",
      "A light-cure flowable composite made for tooth gem application. Easy to control, fast to cure and simple to remove by a professional.",
      "Tooth gem adhesive — light-cure, 2 ml",
    ),
    translations: { fr: C, de: C },
  },
  {
    id: "p-curing-light",
    type: "product",
    name: "Curing Light Pro LED",
    context: "Tools · GT-TOOL-LED",
    priority: "normal",
    updatedAt: "2026-08-30",
    fields: product(
      "Curing Light Pro LED",
      "Cordless LED curing light with three timed modes.",
      "A cordless, lightweight LED curing lamp with 5, 10 and 20-second modes and a rotating head for easy access to every tooth.",
      "Cordless LED curing light for tooth gems",
    ),
    translations: { fr: C, it: C },
  },
  {
    id: "p-starter-kit",
    type: "product",
    name: "Starter Pro Kit — 120 gems",
    context: "Kits · GT-KIT-START",
    priority: "high",
    updatedAt: "2026-09-19",
    fields: product(
      "Starter Pro Kit — 120 gems",
      "Everything you need to open your first appointments.",
      "120 crystals and charms, adhesive, etching gel, applicators and a curing light: the complete set used in our certified training.",
      "Tooth gem starter kit for professionals",
    ),
    translations: { fr: C, it: { name: { value: "Kit Starter Pro — 120 gemme" } } },
  },
  {
    id: "p-aftercare-rinse",
    type: "product",
    name: "Aftercare Rinse 250 ml",
    context: "Aftercare · GT-CARE-RIN",
    priority: "low",
    updatedAt: "2026-08-14",
    fields: product(
      "Aftercare Rinse 250 ml",
      "A gentle, alcohol-free rinse for the first days after placement.",
      "An alcohol-free mouth rinse that keeps the area clean without weakening the bond. Mint flavour.",
      "Alcohol-free aftercare rinse for tooth gems",
    ),
    translations: { fr: C, it: C, de: C },
  },

  /* Categories ----------------------------------------------------------- */
  {
    id: "c-crystals",
    type: "category",
    name: "Crystals",
    context: "Shop › Crystals",
    priority: "normal",
    updatedAt: "2026-09-10",
    fields: category(
      "Crystals",
      "Lead-free crystals in every cut, size and colour, selected for their brilliance.",
      "Tooth gem crystals — every cut and colour",
    ),
    translations: {
      fr: C,
      it: C,
      de: {
        name: { value: "Kristalle" },
        description: { value: "Bleifreie Kristalle in jedem Schliff, jeder Größe und Farbe, ausgewählt für ihre Brillanz." },
      },
    },
  },
  {
    id: "c-gold",
    type: "category",
    name: "Gold charms",
    context: "Shop › Gold charms",
    priority: "high",
    updatedAt: "2026-09-18",
    fields: category(
      "Gold charms",
      "Solid 18k gold charms, hand-finished and certified.",
      "Solid gold tooth charms — 18k, certified",
    ),
    translations: { fr: C },
  },
  {
    id: "c-adhesives",
    type: "category",
    name: "Adhesives & bonding",
    context: "Shop › Adhesives & bonding",
    priority: "normal",
    updatedAt: "2026-09-02",
    fields: category(
      "Adhesives & bonding",
      "Etching gels, primers and light-cure adhesives for a safe, lasting bond.",
      "Tooth gem adhesives and bonding supplies",
    ),
    translations: { fr: C, it: C, es: { name: { value: "Adhesivos y fijación" } } },
  },
  {
    id: "c-tools",
    type: "category",
    name: "Tools & equipment",
    context: "Shop › Tools & equipment",
    priority: "low",
    updatedAt: "2026-08-22",
    fields: category(
      "Tools & equipment",
      "Curing lights, applicators and the small tools that make placement precise.",
      "Professional tooth gem tools",
    ),
    translations: { fr: C, it: C, de: C },
  },
  {
    id: "c-kits",
    type: "category",
    name: "Professional kits",
    context: "Shop › Professional kits",
    priority: "high",
    updatedAt: "2026-09-19",
    fields: category(
      "Professional kits",
      "Complete kits for artists starting out or restocking their studio.",
      "Professional tooth gem kits",
    ),
    translations: {
      fr: {
        name: { value: "Kits professionnels" },
        description: { value: "Des kits complets pour les artistes qui débutent ou réapprovisionnent leur studio." },
      },
    },
  },
  {
    id: "c-aftercare",
    type: "category",
    name: "Aftercare",
    context: "Shop › Aftercare",
    priority: "low",
    updatedAt: "2026-08-14",
    fields: category(
      "Aftercare",
      "Everything your clients need to keep their gems bright.",
      "Tooth gem aftercare products",
    ),
    translations: { fr: C, it: C },
  },

  /* Training modules ----------------------------------------------------- */
  {
    id: "m-intro",
    type: "module",
    name: "Introduction to Tooth Gems",
    context: "Certified Tooth Gem Artist · Module 1",
    priority: "high",
    updatedAt: "2026-09-15",
    fields: module(
      "Introduction to Tooth Gems",
      "Where tooth gems come from, what they are made of and what a professional placement involves.",
      "Explain the history of tooth gems · Recognise quality materials · Describe the placement process to a client",
    ),
    translations: { fr: C, it: C, es: C },
  },
  {
    id: "m-hygiene",
    type: "module",
    name: "Hygiene & Safety Protocols",
    context: "Certified Tooth Gem Artist · Module 2",
    priority: "high",
    updatedAt: "2026-09-11",
    fields: module(
      "Hygiene & Safety Protocols",
      "Setting up a clean workstation, protecting your client and knowing when not to place a gem.",
      "Prepare a hygienic workstation · Screen clients for contraindications · Handle materials safely",
    ),
    translations: { fr: C },
  },
  {
    id: "m-bonding",
    type: "module",
    name: "Bonding Technique Step by Step",
    context: "Certified Tooth Gem Artist · Module 3",
    priority: "normal",
    updatedAt: "2026-09-08",
    fields: module(
      "Bonding Technique Step by Step",
      "Isolation, etching, adhesive and curing — the full placement, filmed from three angles.",
      "Isolate and dry the tooth · Apply adhesive in the right quantity · Cure and check the bond",
    ),
    translations: { fr: C, it: C, de: { title: { value: "Klebetechnik Schritt für Schritt" } } },
  },
  {
    id: "m-design",
    type: "module",
    name: "Placement & Design Consultation",
    context: "Certified Tooth Gem Artist · Module 4",
    priority: "normal",
    updatedAt: "2026-09-01",
    fields: module(
      "Placement & Design Consultation",
      "Guiding a client towards a design that suits their smile, and planning multi-gem layouts.",
      "Run a design consultation · Plan symmetrical layouts · Set realistic expectations",
    ),
    translations: { fr: C, it: C, de: C },
  },
  {
    id: "m-removal",
    type: "module",
    name: "Removal and Aftercare Advice",
    context: "Certified Tooth Gem Artist · Module 5",
    priority: "normal",
    updatedAt: "2026-09-17",
    fields: module(
      "Removal and Aftercare Advice",
      "Removing a gem without damaging the enamel, and the aftercare advice to give every client.",
      "Remove a gem safely · Polish the enamel after removal · Give clear aftercare instructions",
    ),
    translations: {
      fr: {
        title: { value: "Retrait et conseils d'entretien" },
        summary: { value: "Retirer un bijou dentaire sans abîmer l'émail.", outdated: true },
      },
      it: C,
      de: C,
    },
  },

  /* Emails --------------------------------------------------------------- */
  {
    id: "e-order-confirmation",
    type: "email",
    name: "Order confirmation",
    context: "Sent when an order is paid",
    priority: "high",
    updatedAt: "2026-09-14",
    fields: email(
      "Your order {{order_number}} is confirmed",
      "Thank you — we are preparing your parcel.",
      "Hello {{first_name}},\n\nThank you for your order. We are preparing it with care and will email you as soon as it ships.",
    ),
    translations: { fr: C, it: C, de: C, es: { subject: { value: "Tu pedido {{order_number}} está confirmado" } } },
  },
  {
    id: "e-shipping",
    type: "email",
    name: "Shipping notification",
    context: "Sent when a parcel leaves the studio",
    priority: "normal",
    updatedAt: "2026-09-09",
    fields: email(
      "Your order is on its way",
      "Track your parcel in one click.",
      "Hello {{first_name}},\n\nGood news: your order {{order_number}} has left our studio. Follow it here: {{tracking_url}}",
    ),
    translations: { fr: C, it: { subject: { value: "Il tuo ordine è in viaggio" } } },
  },
  {
    id: "e-enrolment",
    type: "email",
    name: "Course enrolment welcome",
    context: "Sent when a training is purchased",
    priority: "normal",
    updatedAt: "2026-09-03",
    fields: email(
      "Welcome to {{course_name}}",
      "Your first lesson is ready.",
      "Hello {{first_name}},\n\nWelcome to the Academy. Your training is ready — start the first lesson whenever you like.",
    ),
    translations: { fr: C, it: C },
  },

  /* Other content -------------------------------------------------------- */
  {
    id: "o-aftercare-guide",
    type: "content",
    name: "Aftercare Guide",
    context: "Page · /aftercare",
    priority: "high",
    updatedAt: "2026-09-20",
    fields: [
      { key: "title", source: "Aftercare Guide" },
      {
        key: "body",
        source:
          "For the first 24 hours, avoid very hot drinks and sticky food. Brush gently around the gem with a soft toothbrush, and never try to remove it yourself.",
        multiline: true,
      },
    ],
    translations: { fr: C, de: C },
  },
  {
    id: "o-shipping-faq",
    type: "content",
    name: "Shipping & Returns FAQ",
    context: "Page · /help/shipping",
    priority: "low",
    updatedAt: "2026-08-27",
    fields: [
      { key: "title", source: "Shipping & Returns FAQ" },
      {
        key: "body",
        source: "Orders ship within one business day from Paris. Unopened products can be returned within 14 days of delivery.",
        multiline: true,
      },
    ],
    translations: { fr: C, it: C, es: { title: { value: "Preguntas frecuentes sobre envíos y devoluciones" } } },
  },
];
