import type { Localized } from "./types";

/**
 * Mock data behind the Promotions & Gift Cards workspace.
 *
 * Like `adminCatalog.ts`, this file is the seam a real backend replaces: the
 * screens only read the types declared here and call the store in
 * `lib/adminPromotions.tsx`.
 *
 * Two rules shape it:
 *
 * - **Money is integer cents.** Gift card balances are the one place in the
 *   prototype where amounts are added and subtracted, so they follow the money
 *   rule in `AGENTS.md` rather than the catalogue's plain euros.
 * - **Status is derived, never stored.** A promotion stores its lifecycle
 *   (draft, live, paused, archived) and its dates; "active", "scheduled" and
 *   "expired" are read off the calendar against `PROMO_NOW`. A badge can
 *   therefore never disagree with the schedule printed beside it. The same goes
 *   for campaigns and for gift card balances, which are the sum of their ledger.
 */

/**
 * The prototype's "now".
 *
 * Fixed rather than read from the wall clock: the campaigns in the brief are
 * dated 2027, and a real `new Date()` would slowly turn every one of them into
 * "expired". The workspace prints this date so nobody mistakes it for a bug.
 */
export const PROMO_NOW = "2027-11-24T10:00:00+01:00";
export const PROMO_TIMEZONE = "Europe/Paris";

export const TIMEZONES = ["Europe/Paris", "Europe/Brussels", "Europe/Berlin", "Europe/Dublin", "Europe/London", "UTC"] as const;
export type Timezone = (typeof TIMEZONES)[number];

/* -------------------------------------------------------------------------- */
/* Promotions                                                                 */
/* -------------------------------------------------------------------------- */

export type PromotionType = "percentage" | "fixed" | "bxgy" | "freeShipping" | "bundle" | "gift";
export const PROMOTION_TYPES: PromotionType[] = ["percentage", "fixed", "bxgy", "freeShipping", "bundle", "gift"];

/** What an administrator sets. */
export type PromotionLifecycle = "draft" | "live" | "paused" | "archived";

/** What the badge says: the lifecycle read against the calendar. */
export type PromotionStatus = "active" | "scheduled" | "expired" | "draft" | "paused" | "archived";
export const PROMOTION_STATUSES: PromotionStatus[] = ["active", "scheduled", "expired", "draft", "paused", "archived"];

export type EligibilityScope = "all" | "products" | "categories" | "collections";
export type CustomerEligibility = "all" | "new" | "existing" | "segments";

export interface DiscountConfig {
  type: PromotionType;
  /** Percentage: 1–100. */
  percent?: number;
  /** Percentage: cap on the discount, in cents. */
  maxDiscountCents?: number | null;
  /** Fixed amount off, in cents. */
  amountCents?: number;
  /** Minimum order for fixed / free shipping, in cents. */
  minOrderCents?: number | null;
  /** Buy X get Y. */
  buyQty?: number;
  getQty?: number;
  /** Buy X get Y reward: 100 = free, 50 = half price. */
  rewardPercent?: number;
  /** Bundle: the products sold together and their joint price. */
  bundleProductIds?: string[];
  bundlePriceCents?: number;
  /** Gift with purchase. */
  giftProductId?: string;
}

export interface Eligibility {
  scope: EligibilityScope;
  productIds: string[];
  categoryIds: string[];
  collectionIds: string[];
  customers: CustomerEligibility;
  segmentIds: string[];
  minCartCents: number | null;
  minQuantity: number | null;
}

export interface UsageRules {
  maxTotal: number | null;
  maxPerCustomer: number | null;
  combinable: boolean;
  excludeDiscounted: boolean;
  excludeGiftCards: boolean;
  excludedProductIds: string[];
}

export interface Schedule {
  /** Local date-time as typed, `YYYY-MM-DDTHH:mm`. */
  startsAt: string;
  endsAt: string | null;
  timezone: Timezone;
}

export interface PromoCodeConfig {
  mode: "automatic" | "code";
  code: string;
  caseSensitive: boolean;
  /** "One code for everyone" or "unique single-use codes". */
  kind: "shared" | "unique";
  uniqueCount: number | null;
}

export interface PromotionStats {
  uses: number;
  orders: number;
  revenueCents: number;
  discountCents: number;
  /** Share of sessions shown the promotion that converted, in percent. */
  conversionRate: number;
  /** Uses per day over the last 14 days of the promotion's life. */
  daily: number[];
}

export interface Promotion {
  id: string;
  /** Internal name — what the team calls it. Single language, like a SKU. */
  name: string;
  internalDescription: string;
  customerTitle: Localized;
  customerDescription: Localized;
  discount: DiscountConfig;
  eligibility: Eligibility;
  usage: UsageRules;
  schedule: Schedule;
  code: PromoCodeConfig;
  campaignId: string | null;
  lifecycle: PromotionLifecycle;
  stats: PromotionStats;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/* -------------------------------------------------------------------------- */
/* Shared reference lists                                                     */
/* -------------------------------------------------------------------------- */

export interface Collection {
  id: string;
  name: Localized;
  productIds: string[];
}

export const COLLECTIONS: Collection[] = [
  {
    id: "best-sellers",
    name: { fr: "Best-sellers", en: "Best-sellers" },
    productIds: ["crystal-star", "chrome-heart", "swarovski-set", "opal-drop"],
  },
  {
    id: "new-in",
    name: { fr: "Nouveautés", en: "New in" },
    productIds: ["curing-lamp", "chrome-cross", "mini-crystal-collection"],
  },
  {
    id: "pro-studio",
    name: { fr: "Équipement studio", en: "Studio equipment" },
    productIds: ["application-kit-pro", "curing-lamp", "removal-pliers", "display-tray", "sterile-capsules"],
  },
  {
    id: "chrome",
    name: { fr: "Ligne Chrome", en: "Chrome line" },
    productIds: ["chrome-heart", "chrome-cross"],
  },
];

export interface Segment {
  id: string;
  name: Localized;
  size: number;
}

export const SEGMENTS: Segment[] = [
  { id: "vip", name: { fr: "Clients VIP", en: "VIP customers" }, size: 184 },
  { id: "certified", name: { fr: "Artistes certifiés", en: "Certified artists" }, size: 412 },
  { id: "studios", name: { fr: "Studios professionnels", en: "Professional studios" }, size: 96 },
  { id: "newsletter", name: { fr: "Abonnés newsletter", en: "Newsletter subscribers" }, size: 3820 },
];

/* -------------------------------------------------------------------------- */
/* Campaigns                                                                  */
/* -------------------------------------------------------------------------- */

export type CampaignLifecycle = "draft" | "live" | "paused" | "archived";
export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";
export const CAMPAIGN_STATUSES: CampaignStatus[] = ["active", "scheduled", "draft", "paused", "completed", "archived"];

/** Visual themes a campaign banner can wear. Tokens only, no hex in components. */
export type CampaignTheme = "sparkle" | "noir" | "blush" | "mint" | "winter";
export const CAMPAIGN_THEMES: CampaignTheme[] = ["sparkle", "noir", "blush", "mint", "winter"];

export interface CampaignActivity {
  id: string;
  at: string;
  actor: string;
  kind: "created" | "scheduled" | "promotionAdded" | "productsAdded" | "edited" | "started" | "ended" | "paused" | "archived";
  /** Free detail, already written in the author's words. */
  detail: Localized;
}

export interface Campaign {
  id: string;
  name: string;
  internalDescription: string;
  title: Localized;
  description: Localized;
  startsAt: string;
  endsAt: string;
  theme: CampaignTheme;
  /** A photo from the brand library, or null for a pure typographic banner. */
  cover: string | null;
  productIds: string[];
  lifecycle: CampaignLifecycle;
  activity: CampaignActivity[];
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Gift cards                                                                 */
/* -------------------------------------------------------------------------- */

export type GiftCardDesign = "sparkle" | "blush" | "noir" | "mint" | "photo";
export const GIFT_CARD_DESIGNS: GiftCardDesign[] = ["sparkle", "blush", "noir", "mint", "photo"];

export type GiftCardStatus = "active" | "partiallyRedeemed" | "redeemed" | "scheduled" | "expired" | "cancelled";
export const GIFT_CARD_STATUSES: GiftCardStatus[] = [
  "active",
  "partiallyRedeemed",
  "redeemed",
  "scheduled",
  "expired",
  "cancelled",
];

export type DeliveryStatus = "delivered" | "opened" | "scheduled" | "bounced";
export const DELIVERY_STATUSES: DeliveryStatus[] = ["delivered", "opened", "scheduled", "bounced"];

export interface GiftCardTransaction {
  id: string;
  kind: "purchase" | "redemption" | "adjustment" | "extension" | "cancellation" | "resend";
  /** Signed: + credits the card, − spends it. Zero for events that move no money. */
  amountCents: number;
  at: string;
  actor: string;
  orderRef?: string;
  note?: string;
}

export interface GiftCard {
  code: string;
  recipientName: string;
  recipientEmail: string;
  purchaserName: string;
  purchaserEmail: string;
  senderName: string;
  message: string;
  design: GiftCardDesign;
  purchasedAt: string;
  deliverAt: string;
  expiresAt: string;
  orderRef: string;
  cancelled: boolean;
  delivery: DeliveryStatus;
  ledger: GiftCardTransaction[];
}

/** The storefront product — what a customer configures on `/carte-cadeau`. */
export interface GiftCardProductConfig {
  title: Localized;
  description: Localized;
  /** Ordered, in cents. Order is the order on the storefront. */
  amounts: number[];
  allowCustomAmount: boolean;
  minCents: number;
  maxCents: number;
  /** Months of validity; null means the card does not expire. */
  expiryMonths: number | null;
  allowScheduledDelivery: boolean;
  fields: {
    recipientName: FieldMode;
    recipientEmail: FieldMode;
    senderName: FieldMode;
    message: FieldMode;
  };
  messageMaxLength: number;
  designs: { id: GiftCardDesign; enabled: boolean }[];
  defaultDesign: GiftCardDesign;
  published: boolean;
}

export type FieldMode = "required" | "optional" | "hidden";

/* -------------------------------------------------------------------------- */
/* Derivations                                                                */
/* -------------------------------------------------------------------------- */

/** Minutes since epoch of a stored local date-time, read as Paris time. */
export function toTime(local: string): number {
  // The mock data is authored in Paris time. Appending the offset keeps the
  // comparison independent of the reviewer's own machine timezone.
  if (/[zZ]|[+-]\d\d:\d\d$/.test(local)) return new Date(local).getTime();
  return new Date(`${local.length === 10 ? `${local}T00:00` : local}:00+01:00`).getTime();
}

export const NOW_TIME = toTime(PROMO_NOW);

export function promotionStatus(p: Pick<Promotion, "lifecycle" | "schedule">, now = NOW_TIME): PromotionStatus {
  if (p.lifecycle === "archived") return "archived";
  if (p.lifecycle === "draft") return "draft";
  if (p.schedule.endsAt && toTime(p.schedule.endsAt) < now) return "expired";
  if (p.lifecycle === "paused") return "paused";
  if (toTime(p.schedule.startsAt) > now) return "scheduled";
  return "active";
}

export function campaignStatus(c: Pick<Campaign, "lifecycle" | "startsAt" | "endsAt">, now = NOW_TIME): CampaignStatus {
  if (c.lifecycle === "archived") return "archived";
  if (c.lifecycle === "draft") return "draft";
  if (toTime(c.endsAt) < now) return "completed";
  if (c.lifecycle === "paused") return "paused";
  if (toTime(c.startsAt) > now) return "scheduled";
  return "active";
}

export function giftCardBalance(card: GiftCard): number {
  return card.ledger.reduce((sum, tx) => sum + tx.amountCents, 0);
}

/** What the card was worth at purchase — the first ledger line. */
export function giftCardInitial(card: GiftCard): number {
  return card.ledger.find((tx) => tx.kind === "purchase")?.amountCents ?? 0;
}

export function giftCardStatus(card: GiftCard, now = NOW_TIME): GiftCardStatus {
  if (card.cancelled) return "cancelled";
  const balance = giftCardBalance(card);
  if (balance <= 0) return "redeemed";
  if (toTime(card.expiresAt) < now) return "expired";
  if (toTime(card.deliverAt) > now) return "scheduled";
  return balance < giftCardInitial(card) ? "partiallyRedeemed" : "active";
}

/** Days between two stored dates, rounded. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toTime(to) - toTime(from)) / 86_400_000);
}

export function daysFromNow(date: string): number {
  return Math.round((toTime(date) - NOW_TIME) / 86_400_000);
}

/* -------------------------------------------------------------------------- */
/* Seed builders                                                              */
/* -------------------------------------------------------------------------- */

const ALL_ELIGIBLE: Eligibility = {
  scope: "all",
  productIds: [],
  categoryIds: [],
  collectionIds: [],
  customers: "all",
  segmentIds: [],
  minCartCents: null,
  minQuantity: null,
};

const DEFAULT_USAGE: UsageRules = {
  maxTotal: null,
  maxPerCustomer: 1,
  combinable: false,
  excludeDiscounted: true,
  excludeGiftCards: true,
  excludedProductIds: [],
};

const AUTOMATIC: PromoCodeConfig = { mode: "automatic", code: "", caseSensitive: false, kind: "shared", uniqueCount: null };

function withCode(code: string): PromoCodeConfig {
  return { mode: "code", code, caseSensitive: false, kind: "shared", uniqueCount: null };
}

function curve(peak: number, shape: "rise" | "flat" | "fall" | "spike" | "none"): number[] {
  const base = Array.from({ length: 14 }, (_, i) => i);
  switch (shape) {
    case "rise":
      return base.map((i) => Math.round(peak * (0.25 + (i / 13) * 0.75) * (0.9 + ((i * 7) % 5) / 25)));
    case "fall":
      return base.map((i) => Math.round(peak * (1 - (i / 13) * 0.7) * (0.9 + ((i * 3) % 5) / 25)));
    case "spike":
      return base.map((i) => Math.round(peak * (i > 8 && i < 12 ? 1 : 0.22 + ((i * 5) % 4) / 20)));
    case "flat":
      return base.map((i) => Math.round(peak * (0.7 + ((i * 7) % 6) / 20)));
    default:
      return base.map(() => 0);
  }
}

function stats(
  uses: number,
  revenueEuros: number,
  discountEuros: number,
  conversionRate: number,
  shape: Parameters<typeof curve>[1],
): PromotionStats {
  return {
    uses,
    orders: uses,
    revenueCents: Math.round(revenueEuros * 100),
    discountCents: Math.round(discountEuros * 100),
    conversionRate,
    daily: curve(Math.max(1, Math.round(uses / 10)), shape),
  };
}

const NO_STATS = stats(0, 0, 0, 0, "none");

/* -------------------------------------------------------------------------- */
/* Seed: promotions                                                           */
/* -------------------------------------------------------------------------- */

export const SEED_PROMOTIONS: Promotion[] = [
  {
    id: "black-friday-25",
    name: "Black Friday -25%",
    internalDescription: "Sitewide headline offer for the Black Friday weekend. Capped so a studio order cannot take more than €60 off.",
    customerTitle: { fr: "Black Friday : -25 % sur tout", en: "Black Friday: 25% off everything" },
    customerDescription: {
      fr: "Quatre jours pour faire briller chaque sourire. -25 % sur toute la boutique, remise plafonnée à 60 €.",
      en: "Four days to make every smile sparkle. 25% off the whole shop, discount capped at €60.",
    },
    discount: { type: "percentage", percent: 25, maxDiscountCents: 6000 },
    eligibility: { ...ALL_ELIGIBLE },
    usage: { ...DEFAULT_USAGE, maxTotal: 2500, maxPerCustomer: 1 },
    schedule: { startsAt: "2027-11-26T00:00", endsAt: "2027-11-29T23:59", timezone: "Europe/Paris" },
    code: withCode("BLACKFRIDAY25"),
    campaignId: "black-friday-2027",
    lifecycle: "live",
    stats: NO_STATS,
    createdAt: "2027-10-28T10:12:00+01:00",
    createdBy: "Camille Dubois",
    updatedAt: "2027-11-19T16:40:00+01:00",
    updatedBy: "Inès Moreau",
  },
  {
    id: "buy-2-get-1",
    name: "Buy 2, Get 1 Free",
    internalDescription: "Early Black Friday week offer on best-selling gems. Cheapest item is free.",
    customerTitle: { fr: "2 achetés, le 3e offert", en: "Buy 2, get 1 free" },
    customerDescription: {
      fr: "Sur une sélection de nos gems best-sellers : le moins cher des trois vous est offert.",
      en: "On a selection of our best-selling gems: the cheapest of the three is on us.",
    },
    discount: { type: "bxgy", buyQty: 2, getQty: 1, rewardPercent: 100 },
    eligibility: { ...ALL_ELIGIBLE, scope: "collections", collectionIds: ["best-sellers"] },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: 2, excludeDiscounted: false },
    schedule: { startsAt: "2027-11-22T00:00", endsAt: "2027-11-29T23:59", timezone: "Europe/Paris" },
    code: AUTOMATIC,
    campaignId: "black-friday-2027",
    lifecycle: "live",
    stats: stats(318, 21840, 3290, 6.8, "rise"),
    createdAt: "2027-10-30T09:05:00+01:00",
    createdBy: "Camille Dubois",
    updatedAt: "2027-11-21T18:22:00+01:00",
    updatedBy: "Camille Dubois",
  },
  {
    id: "free-shipping-weekend",
    name: "Free Shipping Weekend",
    internalDescription: "Standard delivery offered over €40 during the Black Friday weekend (FR, BE, DE, IE).",
    customerTitle: { fr: "Livraison offerte ce week-end", en: "Free shipping this weekend" },
    customerDescription: {
      fr: "Livraison standard offerte dès 40 € d’achat, samedi et dimanche.",
      en: "Free standard delivery on orders over €40, Saturday and Sunday.",
    },
    discount: { type: "freeShipping", minOrderCents: 4000 },
    eligibility: { ...ALL_ELIGIBLE, minCartCents: 4000 },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: null, combinable: true, excludeDiscounted: false },
    schedule: { startsAt: "2027-11-27T00:00", endsAt: "2027-11-28T23:59", timezone: "Europe/Paris" },
    code: AUTOMATIC,
    campaignId: "black-friday-2027",
    lifecycle: "live",
    stats: NO_STATS,
    createdAt: "2027-11-02T11:30:00+01:00",
    createdBy: "Inès Moreau",
    updatedAt: "2027-11-02T11:30:00+01:00",
    updatedBy: "Inès Moreau",
  },
  {
    id: "starter-kit-15",
    name: "Toothgem Starter Kit -15%",
    internalDescription: "Launch support for the refreshed Starter Kit. Automatic, no code.",
    customerTitle: { fr: "Kit Découverte : -15 %", en: "Starter Kit: 15% off" },
    customerDescription: {
      fr: "Tout ce qu’il faut pour poser vos premières gems, à prix de lancement.",
      en: "Everything you need to set your first gems, at a launch price.",
    },
    discount: { type: "percentage", percent: 15, maxDiscountCents: null },
    eligibility: { ...ALL_ELIGIBLE, scope: "products", productIds: ["starter-kit"] },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: 1 },
    schedule: { startsAt: "2027-10-15T09:00", endsAt: "2027-12-31T23:59", timezone: "Europe/Paris" },
    code: AUTOMATIC,
    campaignId: "new-collection-launch",
    lifecycle: "live",
    stats: stats(206, 18130, 2720, 4.9, "flat"),
    createdAt: "2027-10-08T14:00:00+02:00",
    createdBy: "Camille Dubois",
    updatedAt: "2027-10-14T17:45:00+02:00",
    updatedBy: "Camille Dubois",
  },
  {
    id: "new-artist-welcome",
    name: "New Artist Welcome",
    internalDescription: "Evergreen welcome offer for first orders. Sent in the welcome email sequence.",
    customerTitle: { fr: "Bienvenue : 15 € offerts", en: "Welcome: €15 off" },
    customerDescription: {
      fr: "15 € de remise sur votre première commande dès 80 € d’achat.",
      en: "€15 off your first order over €80.",
    },
    discount: { type: "fixed", amountCents: 1500, minOrderCents: 8000 },
    eligibility: { ...ALL_ELIGIBLE, customers: "new", minCartCents: 8000 },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: 1 },
    schedule: { startsAt: "2027-01-01T00:00", endsAt: null, timezone: "Europe/Paris" },
    code: withCode("WELCOME15"),
    campaignId: null,
    lifecycle: "live",
    stats: stats(1184, 142_080, 17_760, 11.2, "flat"),
    createdAt: "2026-12-18T10:00:00+01:00",
    createdBy: "Camille Dubois",
    updatedAt: "2027-06-03T09:15:00+02:00",
    updatedBy: "Inès Moreau",
  },
  {
    id: "vip-free-shipping",
    name: "VIP Free Shipping",
    internalDescription: "Always-on perk for the VIP segment. Combines with everything.",
    customerTitle: { fr: "Livraison offerte VIP", en: "VIP free shipping" },
    customerDescription: {
      fr: "En tant que cliente VIP, la livraison est toujours offerte.",
      en: "As a VIP customer, delivery is always on us.",
    },
    discount: { type: "freeShipping", minOrderCents: null },
    eligibility: { ...ALL_ELIGIBLE, customers: "segments", segmentIds: ["vip"] },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: null, combinable: true, excludeDiscounted: false, excludeGiftCards: false },
    schedule: { startsAt: "2027-03-01T00:00", endsAt: null, timezone: "Europe/Paris" },
    code: AUTOMATIC,
    campaignId: null,
    lifecycle: "live",
    stats: stats(462, 51_900, 3_420, 18.4, "flat"),
    createdAt: "2027-02-20T15:10:00+01:00",
    createdBy: "Camille Dubois",
    updatedAt: "2027-02-20T15:10:00+01:00",
    updatedBy: "Camille Dubois",
  },
  {
    id: "pro-studio-10",
    name: "Pro Studio -10%",
    internalDescription: "Studio equipment discount for certified artists. Paused while the curing lamp is restocked.",
    customerTitle: { fr: "Artistes certifiés : -10 % sur l’équipement", en: "Certified artists: 10% off equipment" },
    customerDescription: {
      fr: "Votre certification Global Toothgems vous ouvre -10 % sur tout l’équipement studio.",
      en: "Your Global Toothgems certification unlocks 10% off all studio equipment.",
    },
    discount: { type: "percentage", percent: 10, maxDiscountCents: null },
    eligibility: { ...ALL_ELIGIBLE, scope: "categories", categoryIds: ["tools"], customers: "segments", segmentIds: ["certified", "studios"] },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: null, combinable: true },
    schedule: { startsAt: "2027-04-01T00:00", endsAt: null, timezone: "Europe/Paris" },
    code: withCode("PROSTUDIO10"),
    campaignId: null,
    lifecycle: "paused",
    stats: stats(271, 38_420, 4_270, 9.6, "fall"),
    createdAt: "2027-03-22T11:00:00+01:00",
    createdBy: "Inès Moreau",
    updatedAt: "2027-11-12T08:50:00+01:00",
    updatedBy: "Camille Dubois",
  },
  {
    id: "christmas-gift-aftercare",
    name: "Free Aftercare Gel over €120",
    internalDescription: "Gift with purchase for the Christmas campaign. 400 gels reserved in stock.",
    customerTitle: { fr: "Un Gel de Suivi offert dès 120 €", en: "Free Aftercare Gel over €120" },
    customerDescription: {
      fr: "Pour Noël, votre Gel de Suivi est offert dès 120 € d’achat.",
      en: "For Christmas, your Aftercare Gel is on us with orders over €120.",
    },
    discount: { type: "gift", giftProductId: "aftercare-gel", minOrderCents: 12000 },
    eligibility: { ...ALL_ELIGIBLE, minCartCents: 12000 },
    usage: { ...DEFAULT_USAGE, maxTotal: 400, maxPerCustomer: 1, combinable: true },
    schedule: { startsAt: "2027-12-01T00:00", endsAt: "2027-12-24T23:59", timezone: "Europe/Paris" },
    code: AUTOMATIC,
    campaignId: "christmas-2027",
    lifecycle: "live",
    stats: NO_STATS,
    createdAt: "2027-11-05T10:20:00+01:00",
    createdBy: "Camille Dubois",
    updatedAt: "2027-11-18T12:00:00+01:00",
    updatedBy: "Camille Dubois",
  },
  {
    id: "sparkle-duo-bundle",
    name: "Sparkle Duo Bundle",
    internalDescription: "Crystal Star + Chrome Heart sold together for Christmas.",
    customerTitle: { fr: "Duo Sparkle : 55 € les deux", en: "Sparkle Duo: both for €55" },
    customerDescription: {
      fr: "L’Étoile Cristal et le Cœur Chrome réunis dans un duo à offrir.",
      en: "The Crystal Star and the Chrome Heart together, ready to gift.",
    },
    discount: { type: "bundle", bundleProductIds: ["crystal-star", "chrome-heart"], bundlePriceCents: 5500 },
    eligibility: { ...ALL_ELIGIBLE, scope: "products", productIds: ["crystal-star", "chrome-heart"] },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: 3 },
    schedule: { startsAt: "2027-12-01T00:00", endsAt: "2027-12-26T23:59", timezone: "Europe/Paris" },
    code: AUTOMATIC,
    campaignId: "christmas-2027",
    lifecycle: "live",
    stats: NO_STATS,
    createdAt: "2027-11-06T09:40:00+01:00",
    createdBy: "Inès Moreau",
    updatedAt: "2027-11-06T09:40:00+01:00",
    updatedBy: "Inès Moreau",
  },
  {
    id: "christmas-early-bird",
    name: "Christmas Early Bird -15%",
    internalDescription: "Draft — dates still to confirm with the newsletter team.",
    customerTitle: { fr: "Noël en avance : -15 %", en: "Early Christmas: 15% off" },
    customerDescription: { fr: "", en: "" },
    discount: { type: "percentage", percent: 15, maxDiscountCents: null },
    eligibility: { ...ALL_ELIGIBLE, customers: "segments", segmentIds: ["newsletter"] },
    usage: { ...DEFAULT_USAGE },
    // Deliberately inconsistent: the end precedes the start and the code is
    // empty. This is the "invalid configuration" state the detail page and the
    // editor have to explain.
    schedule: { startsAt: "2027-12-05T00:00", endsAt: "2027-11-30T23:59", timezone: "Europe/Paris" },
    code: { mode: "code", code: "", caseSensitive: false, kind: "shared", uniqueCount: null },
    campaignId: "christmas-2027",
    lifecycle: "draft",
    stats: NO_STATS,
    createdAt: "2027-11-20T17:05:00+01:00",
    createdBy: "Léa Martin",
    updatedAt: "2027-11-22T09:12:00+01:00",
    updatedBy: "Léa Martin",
  },
  {
    id: "curing-lamp-launch",
    name: "Curing Lamp Launch -€30",
    internalDescription: "Launch discount for the LED curing lamp, waiting for stock confirmation.",
    customerTitle: { fr: "Lampe LED : 30 € offerts", en: "LED lamp: €30 off" },
    customerDescription: {
      fr: "La nouvelle lampe de polymérisation, 30 € moins chère pour son lancement.",
      en: "The new curing lamp, €30 off for its launch.",
    },
    discount: { type: "fixed", amountCents: 3000, minOrderCents: null },
    eligibility: { ...ALL_ELIGIBLE, scope: "products", productIds: ["curing-lamp"] },
    usage: { ...DEFAULT_USAGE, maxTotal: 150 },
    schedule: { startsAt: "2027-12-01T09:00", endsAt: "2027-12-15T23:59", timezone: "Europe/Paris" },
    code: AUTOMATIC,
    campaignId: "new-collection-launch",
    lifecycle: "draft",
    stats: NO_STATS,
    createdAt: "2027-11-15T13:30:00+01:00",
    createdBy: "Camille Dubois",
    updatedAt: "2027-11-15T13:30:00+01:00",
    updatedBy: "Camille Dubois",
  },
  {
    id: "opal-flash-20",
    name: "Opal Flash Sale -20%",
    internalDescription: "48-hour flash sale on the Opal Drop.",
    customerTitle: { fr: "Vente flash Opale : -20 %", en: "Opal flash sale: 20% off" },
    customerDescription: { fr: "48 heures seulement.", en: "48 hours only." },
    discount: { type: "percentage", percent: 20, maxDiscountCents: null },
    eligibility: { ...ALL_ELIGIBLE, scope: "products", productIds: ["opal-drop"] },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: 2 },
    schedule: { startsAt: "2027-10-08T10:00", endsAt: "2027-10-10T10:00", timezone: "Europe/Paris" },
    code: withCode("OPAL20"),
    campaignId: null,
    lifecycle: "live",
    stats: stats(97, 6_210, 1_240, 7.4, "spike"),
    createdAt: "2027-10-06T16:00:00+02:00",
    createdBy: "Inès Moreau",
    updatedAt: "2027-10-06T16:00:00+02:00",
    updatedBy: "Inès Moreau",
  },
  {
    id: "summer-smile-20",
    name: "Summer Smile -20%",
    internalDescription: "Summer campaign headline offer on all gems.",
    customerTitle: { fr: "Summer Smile : -20 % sur les gems", en: "Summer Smile: 20% off gems" },
    customerDescription: {
      fr: "Tout l’été, -20 % sur l’ensemble de nos gems.",
      en: "All summer long, 20% off all our gems.",
    },
    discount: { type: "percentage", percent: 20, maxDiscountCents: 4000 },
    eligibility: { ...ALL_ELIGIBLE, scope: "categories", categoryIds: ["gems"] },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: 3 },
    schedule: { startsAt: "2027-06-21T00:00", endsAt: "2027-08-31T23:59", timezone: "Europe/Paris" },
    code: withCode("SUMMER20"),
    campaignId: "summer-smile",
    lifecycle: "live",
    stats: stats(842, 64_380, 12_870, 8.1, "fall"),
    createdAt: "2027-06-02T10:00:00+02:00",
    createdBy: "Camille Dubois",
    updatedAt: "2027-06-20T19:30:00+02:00",
    updatedBy: "Camille Dubois",
  },
  {
    id: "valentine-heart",
    name: "Valentine's Heart -€10",
    internalDescription: "€10 off the Chrome Heart for Valentine's week.",
    customerTitle: { fr: "Saint-Valentin : 10 € sur le Cœur Chrome", en: "Valentine’s: €10 off the Chrome Heart" },
    customerDescription: { fr: "Un cœur qui brille, pour la semaine des amoureux.", en: "A heart that shines, for lovers’ week." },
    discount: { type: "fixed", amountCents: 1000, minOrderCents: null },
    eligibility: { ...ALL_ELIGIBLE, scope: "products", productIds: ["chrome-heart"] },
    usage: { ...DEFAULT_USAGE, maxPerCustomer: 2 },
    schedule: { startsAt: "2027-02-08T00:00", endsAt: "2027-02-15T23:59", timezone: "Europe/Paris" },
    code: withCode("LOVE10"),
    campaignId: "valentines-week",
    lifecycle: "live",
    stats: stats(214, 9_630, 2_140, 6.2, "spike"),
    createdAt: "2027-01-25T11:00:00+01:00",
    createdBy: "Inès Moreau",
    updatedAt: "2027-01-25T11:00:00+01:00",
    updatedBy: "Inès Moreau",
  },
  {
    id: "spring-glitter-12",
    name: "Spring Glitter -12%",
    internalDescription: "Retired offer on the Glitter Set, kept for reporting.",
    customerTitle: { fr: "Glitter de printemps : -12 %", en: "Spring glitter: 12% off" },
    customerDescription: { fr: "", en: "" },
    discount: { type: "percentage", percent: 12, maxDiscountCents: null },
    eligibility: { ...ALL_ELIGIBLE, scope: "products", productIds: ["glitter-set-2025"] },
    usage: { ...DEFAULT_USAGE },
    schedule: { startsAt: "2027-03-20T00:00", endsAt: "2027-04-20T23:59", timezone: "Europe/Paris" },
    code: withCode("GLITTER12"),
    campaignId: "glitter-season",
    lifecycle: "archived",
    stats: stats(63, 3_480, 470, 3.1, "fall"),
    createdAt: "2027-03-10T09:00:00+01:00",
    createdBy: "Camille Dubois",
    updatedAt: "2027-05-02T10:00:00+02:00",
    updatedBy: "Camille Dubois",
  },
];

/* -------------------------------------------------------------------------- */
/* Seed: campaigns                                                            */
/* -------------------------------------------------------------------------- */

function act(
  id: string,
  at: string,
  actor: string,
  kind: CampaignActivity["kind"],
  fr: string,
  en: string,
): CampaignActivity {
  return { id, at, actor, kind, detail: { fr, en } };
}

export const SEED_CAMPAIGNS: Campaign[] = [
  {
    id: "black-friday-2027",
    name: "Black Friday 2027",
    internalDescription: "Our biggest weekend. Headline -25% sitewide, preceded by a Buy 2 Get 1 week and a free shipping weekend.",
    title: { fr: "Le Black Friday qui fait briller", en: "The Black Friday that sparkles" },
    description: {
      fr: "Jusqu’à -25 % sur toute la boutique, et la livraison offerte ce week-end.",
      en: "Up to 25% off the whole shop, and free shipping this weekend.",
    },
    startsAt: "2027-11-22T00:00",
    endsAt: "2027-11-29T23:59",
    theme: "noir",
    cover: "img-13.jpg",
    productIds: ["crystal-star", "chrome-heart", "swarovski-set", "opal-drop", "starter-kit", "application-kit-pro"],
    lifecycle: "live",
    activity: [
      act("bf-1", "2027-10-28T10:12:00+01:00", "Camille Dubois", "created", "Campagne créée", "Campaign created"),
      act("bf-2", "2027-10-30T09:05:00+01:00", "Camille Dubois", "promotionAdded", "« Buy 2, Get 1 Free » ajoutée", "“Buy 2, Get 1 Free” added"),
      act("bf-3", "2027-11-02T11:30:00+01:00", "Inès Moreau", "promotionAdded", "« Free Shipping Weekend » ajoutée", "“Free Shipping Weekend” added"),
      act("bf-4", "2027-11-19T16:40:00+01:00", "Inès Moreau", "edited", "Plafond de remise fixé à 60 €", "Discount cap set to €60"),
      act("bf-5", "2027-11-22T00:00:00+01:00", "Système", "started", "Campagne démarrée automatiquement", "Campaign started automatically"),
    ],
    createdAt: "2027-10-28T10:12:00+01:00",
    updatedAt: "2027-11-19T16:40:00+01:00",
  },
  {
    id: "christmas-2027",
    name: "Christmas 2027",
    internalDescription: "December gifting campaign: free aftercare gel over €120, the Sparkle Duo bundle and gift cards pushed in every email.",
    title: { fr: "Faites briller leur sourire", en: "Make Their Smile Sparkle" },
    description: {
      fr: "Des gems à offrir, un Gel de Suivi offert dès 120 € et notre Duo Sparkle en édition de Noël.",
      en: "Gems to gift, a free Aftercare Gel over €120 and our Sparkle Duo in a Christmas edition.",
    },
    startsAt: "2027-12-01T00:00",
    endsAt: "2027-12-26T23:59",
    theme: "winter",
    cover: "img-05.jpg",
    productIds: ["crystal-star", "chrome-heart", "aftercare-gel", "swarovski-set", "gold-star-charm"],
    lifecycle: "live",
    activity: [
      act("xm-1", "2027-11-05T10:20:00+01:00", "Camille Dubois", "created", "Campagne créée", "Campaign created"),
      act("xm-2", "2027-11-06T09:40:00+01:00", "Inès Moreau", "promotionAdded", "« Sparkle Duo Bundle » ajoutée", "“Sparkle Duo Bundle” added"),
      act("xm-3", "2027-11-18T12:00:00+01:00", "Camille Dubois", "scheduled", "Programmée pour le 1er décembre", "Scheduled for 1 December"),
      act("xm-4", "2027-11-20T17:05:00+01:00", "Léa Martin", "promotionAdded", "Brouillon « Christmas Early Bird » ajouté", "Draft “Christmas Early Bird” added"),
    ],
    createdAt: "2027-11-05T10:20:00+01:00",
    updatedAt: "2027-11-20T17:05:00+01:00",
  },
  {
    id: "new-collection-launch",
    name: "New Collection Launch",
    internalDescription: "Autumn launch of the refreshed Starter Kit and the new LED curing lamp.",
    title: { fr: "La nouvelle collection est arrivée", en: "The new collection has landed" },
    description: {
      fr: "Un Kit Découverte repensé et une lampe LED de nouvelle génération.",
      en: "A redesigned Starter Kit and a new-generation LED lamp.",
    },
    startsAt: "2027-10-15T09:00",
    endsAt: "2027-12-31T23:59",
    theme: "mint",
    cover: "img-19.jpg",
    productIds: ["starter-kit", "curing-lamp", "chrome-cross", "mini-crystal-collection"],
    lifecycle: "live",
    activity: [
      act("nc-1", "2027-10-08T14:00:00+02:00", "Camille Dubois", "created", "Campagne créée", "Campaign created"),
      act("nc-2", "2027-10-15T09:00:00+02:00", "Système", "started", "Campagne démarrée", "Campaign started"),
      act("nc-3", "2027-11-15T13:30:00+01:00", "Camille Dubois", "promotionAdded", "Brouillon « Curing Lamp Launch » ajouté", "Draft “Curing Lamp Launch” added"),
    ],
    createdAt: "2027-10-08T14:00:00+02:00",
    updatedAt: "2027-11-15T13:30:00+01:00",
  },
  {
    id: "summer-smile",
    name: "Summer Smile",
    internalDescription: "Summer 2027 campaign — best performing campaign of the year.",
    title: { fr: "Un été qui brille", en: "A summer that sparkles" },
    description: { fr: "-20 % sur toutes les gems, tout l’été.", en: "20% off every gem, all summer." },
    startsAt: "2027-06-21T00:00",
    endsAt: "2027-08-31T23:59",
    theme: "sparkle",
    cover: "img-02.jpg",
    productIds: ["crystal-star", "chrome-heart", "opal-drop", "gold-star-charm", "chrome-cross"],
    lifecycle: "live",
    activity: [
      act("ss-1", "2027-06-02T10:00:00+02:00", "Camille Dubois", "created", "Campagne créée", "Campaign created"),
      act("ss-2", "2027-06-21T00:00:00+02:00", "Système", "started", "Campagne démarrée", "Campaign started"),
      act("ss-3", "2027-08-31T23:59:00+02:00", "Système", "ended", "Campagne terminée — 842 utilisations", "Campaign ended — 842 uses"),
    ],
    createdAt: "2027-06-02T10:00:00+02:00",
    updatedAt: "2027-08-31T23:59:00+02:00",
  },
  {
    id: "valentines-week",
    name: "Valentine's Week",
    internalDescription: "One-week campaign around the Chrome Heart.",
    title: { fr: "Semaine des amoureux", en: "Valentine’s Week" },
    description: { fr: "Un cœur qui brille pour celle ou celui que vous aimez.", en: "A heart that shines for the one you love." },
    startsAt: "2027-02-08T00:00",
    endsAt: "2027-02-15T23:59",
    theme: "blush",
    cover: "mouth-03.jpg",
    productIds: ["chrome-heart"],
    lifecycle: "live",
    activity: [
      act("vw-1", "2027-01-25T11:00:00+01:00", "Inès Moreau", "created", "Campagne créée", "Campaign created"),
      act("vw-2", "2027-02-15T23:59:00+01:00", "Système", "ended", "Campagne terminée", "Campaign ended"),
    ],
    createdAt: "2027-01-25T11:00:00+01:00",
    updatedAt: "2027-02-15T23:59:00+01:00",
  },
  {
    id: "spring-studio-days",
    name: "Spring Studio Days",
    internalDescription: "Idea for March 2028: a week dedicated to professional studios. Nothing attached yet.",
    title: { fr: "Les journées Studio", en: "Studio Days" },
    description: { fr: "", en: "" },
    startsAt: "2028-03-13T00:00",
    endsAt: "2028-03-19T23:59",
    theme: "sparkle",
    cover: null,
    productIds: [],
    lifecycle: "draft",
    activity: [act("sd-1", "2027-11-23T15:00:00+01:00", "Léa Martin", "created", "Brouillon créé", "Draft created")],
    createdAt: "2027-11-23T15:00:00+01:00",
    updatedAt: "2027-11-23T15:00:00+01:00",
  },
  {
    id: "glitter-season",
    name: "Glitter Season",
    internalDescription: "Spring 2027 glitter push. Archived after the Glitter Set was retired.",
    title: { fr: "La saison des paillettes", en: "Glitter season" },
    description: { fr: "Nos coffrets glitter à prix doux.", en: "Our glitter sets at a sweet price." },
    startsAt: "2027-03-20T00:00",
    endsAt: "2027-04-20T23:59",
    theme: "blush",
    cover: "img-20.jpg",
    productIds: ["glitter-set-2025"],
    lifecycle: "archived",
    activity: [
      act("gs-1", "2027-03-10T09:00:00+01:00", "Camille Dubois", "created", "Campagne créée", "Campaign created"),
      act("gs-2", "2027-05-02T10:00:00+02:00", "Camille Dubois", "archived", "Campagne archivée", "Campaign archived"),
    ],
    createdAt: "2027-03-10T09:00:00+01:00",
    updatedAt: "2027-05-02T10:00:00+02:00",
  },
];

/* -------------------------------------------------------------------------- */
/* Seed: gift cards                                                           */
/* -------------------------------------------------------------------------- */

let txSeq = 0;
function tx(
  kind: GiftCardTransaction["kind"],
  euros: number,
  at: string,
  extra: Partial<GiftCardTransaction> = {},
): GiftCardTransaction {
  return { id: `tx-${++txSeq}`, kind, amountCents: Math.round(euros * 100), at, actor: "Client", ...extra };
}

interface CardSeed {
  code: string;
  to: [string, string];
  from: [string, string];
  sender?: string;
  value: number;
  bought: string;
  deliver?: string;
  months?: number;
  design: GiftCardDesign;
  order: string;
  message: string;
  spend?: [number, string, string][];
  delivery?: DeliveryStatus;
  cancelled?: boolean;
  extra?: GiftCardTransaction[];
}

function addMonths(date: string, months: number): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return `${d.toISOString().slice(0, 10)}T23:59`;
}

function card(seed: CardSeed): GiftCard {
  const deliverAt = seed.deliver ?? seed.bought;
  return {
    code: seed.code,
    recipientName: seed.to[0],
    recipientEmail: seed.to[1],
    purchaserName: seed.from[0],
    purchaserEmail: seed.from[1],
    senderName: seed.sender ?? seed.from[0].split(" ")[0],
    message: seed.message,
    design: seed.design,
    purchasedAt: seed.bought,
    deliverAt,
    expiresAt: addMonths(deliverAt, seed.months ?? 12),
    orderRef: seed.order,
    cancelled: seed.cancelled ?? false,
    delivery: seed.delivery ?? "opened",
    ledger: [
      tx("purchase", seed.value, seed.bought, { actor: seed.from[0], orderRef: seed.order }),
      ...(seed.spend ?? []).map(([amount, at, order]) => tx("redemption", -amount, at, { actor: seed.to[0], orderRef: order })),
      ...(seed.extra ?? []),
    ],
  };
}

export const SEED_GIFT_CARDS: GiftCard[] = [
  card({
    code: "GTGC-7K2M-Q9XA",
    to: ["Jade Lefèvre", "jade.lefevre@gmail.com"],
    from: ["Manon Lefèvre", "manon.lefevre@orange.fr"],
    value: 100,
    bought: "2027-09-02T18:24",
    design: "sparkle",
    order: "GT-11702",
    message: "Joyeux anniversaire ma sœur ! Fais-toi plaisir avec une nouvelle gem ✨",
    spend: [
      [35, "2027-09-14T11:02", "GT-11758"],
      [20, "2027-10-21T16:40", "GT-11869"],
    ],
  }),
  card({
    code: "GTGC-3PLV-8HRD",
    to: ["Aisling Byrne", "aisling.byrne@eircom.net"],
    from: ["Ciara Byrne", "ciara.byrne@gmail.com"],
    value: 50,
    bought: "2027-11-18T09:15",
    design: "blush",
    order: "GT-11941",
    message: "For your first gem — you’ve been talking about it all year!",
  }),
  card({
    code: "GTGC-X4TN-2WQE",
    to: ["Hannah Weber", "hannah.weber@web.de"],
    from: ["Studio Glanz", "hallo@studio-glanz.de"],
    sender: "Team Studio Glanz",
    value: 200,
    bought: "2027-06-11T14:00",
    design: "noir",
    order: "GT-11420",
    message: "Danke für ein großartiges erstes Jahr im Studio!",
    spend: [
      [120, "2027-06-20T10:18", "GT-11455"],
      [80, "2027-08-03T15:27", "GT-11561"],
    ],
  }),
  card({
    code: "GTGC-9DFB-6YUK",
    to: ["Léa Martin", "lea.martin@gmail.com"],
    from: ["Thomas Martin", "thomas.martin@free.fr"],
    value: 75,
    bought: "2027-11-20T21:47",
    deliver: "2027-12-24T08:00",
    design: "mint",
    order: "GT-11960",
    message: "Joyeux Noël mon amour. Rendez-vous chez ton artiste préférée 💎",
    delivery: "scheduled",
  }),
  card({
    code: "GTGC-5RMA-1ZCT",
    to: ["Clara Vidal", "clara.vidal@studio-vidal.fr"],
    from: ["Nora Benali", "nora.benali@hotmail.fr"],
    value: 25,
    bought: "2026-10-03T12:30",
    design: "sparkle",
    order: "GT-10512",
    message: "Merci pour la formation, tu es une super coach !",
    delivery: "opened",
  }),
  card({
    code: "GTGC-2HQS-7NVP",
    to: ["Sofia Rossi", "sofia.rossi@libero.it"],
    from: ["Giulia Rossi", "giulia.rossi@gmail.com"],
    value: 150,
    bought: "2027-11-10T17:05",
    design: "photo",
    order: "GT-11903",
    message: "Tanti auguri! Un piccolo gioiello per il tuo sorriso.",
    spend: [[42, "2027-11-19T13:33", "GT-11952"]],
  }),
  card({
    code: "GTGC-8WEX-4LJG",
    to: ["Inès Morel", "ines.morel@laposte.net"],
    from: ["Camille Morel", "camille.morel@gmail.com"],
    value: 50,
    bought: "2027-11-22T10:12",
    design: "blush",
    order: "GT-11968",
    message: "Pour ton premier tooth gem, avec tout mon amour.",
    delivery: "bounced",
  }),
  card({
    code: "GTGC-6BYR-3KDM",
    to: ["Lucas Petit", "lucas.petit@outlook.fr"],
    from: ["Emma Petit", "emma.petit@gmail.com"],
    value: 100,
    bought: "2027-07-14T19:40",
    design: "noir",
    order: "GT-11503",
    message: "Bon anniversaire ! On ira ensemble au studio 😉",
    cancelled: true,
    delivery: "delivered",
    extra: [
      tx("cancellation", -100, "2027-07-15T09:30", {
        actor: "Camille Dubois",
        note: "Commande remboursée à la demande de l’acheteuse (erreur de destinataire).",
      }),
    ],
  }),
  card({
    code: "GTGC-4TUP-9QWS",
    to: ["Maëlle Garnier", "maelle.garnier@icloud.com"],
    from: ["Studio Éclat", "contact@studio-eclat.fr"],
    sender: "L’équipe Studio Éclat",
    value: 200,
    bought: "2027-10-01T10:00",
    design: "sparkle",
    order: "GT-11790",
    message: "Bienvenue dans l’équipe ! Pour ton premier kit.",
    spend: [
      [89, "2027-10-04T14:10", "GT-11801"],
      [32, "2027-11-02T11:45", "GT-11884"],
    ],
    extra: [
      tx("adjustment", 15, "2027-11-03T09:20", {
        actor: "Inès Moreau",
        note: "Geste commercial : colis livré avec 5 jours de retard.",
      }),
    ],
  }),
  card({
    code: "GTGC-1NZH-5EFA",
    to: ["Élodie Blanc", "elodie.blanc@gmail.com"],
    from: ["Julie Blanc", "julie.blanc@yahoo.fr"],
    value: 25,
    bought: "2027-11-23T20:18",
    design: "mint",
    order: "GT-11973",
    message: "Un petit rien qui brille, juste parce que.",
    delivery: "delivered",
  }),
  card({
    code: "GTGC-7CVL-8RTB",
    to: ["Amélie Roux", "amelie.roux@sfr.fr"],
    from: ["Paul Roux", "paul.roux@gmail.com"],
    value: 100,
    bought: "2027-02-10T08:55",
    design: "blush",
    order: "GT-11112",
    message: "Bonne Saint-Valentin ❤️",
    spend: [[100, "2027-02-18T17:02", "GT-11139"]],
  }),
  card({
    code: "GTGC-3JMW-6PXN",
    to: ["Noémie Faure", "noemie.faure@gmail.com"],
    from: ["Chloé Faure", "chloe.faure@orange.fr"],
    value: 75,
    bought: "2026-11-05T15:20",
    design: "noir",
    order: "GT-10598",
    message: "Pour ton diplôme d’artiste !",
    spend: [[30, "2027-01-12T10:30", "GT-10877"]],
  }),
  card({
    code: "GTGC-9KSD-2VHY",
    to: ["Zoé Lambert", "zoe.lambert@gmail.com"],
    from: ["Hugo Lambert", "hugo.lambert@proton.me"],
    value: 150,
    bought: "2027-11-21T22:31",
    deliver: "2027-12-01T09:00",
    design: "photo",
    order: "GT-11964",
    message: "Un avant-goût de Noël. Je t’aime.",
    delivery: "scheduled",
  }),
  card({
    code: "GTGC-5GWQ-4MBE",
    to: ["Sarah Cohen", "sarah.cohen@gmail.com"],
    from: ["Rebecca Cohen", "rebecca.cohen@gmail.com"],
    value: 50,
    bought: "2027-08-19T13:14",
    design: "sparkle",
    order: "GT-11588",
    message: "Pour ton sourire, le plus beau du monde.",
    spend: [[18, "2027-09-30T18:05", "GT-11782"]],
  }),
];

/* -------------------------------------------------------------------------- */
/* Seed: gift card product                                                    */
/* -------------------------------------------------------------------------- */

export const SEED_GIFT_CARD_CONFIG: GiftCardProductConfig = {
  title: { fr: "Carte cadeau Global Toothgems", en: "Global Toothgems gift card" },
  description: {
    fr: "Une carte cadeau livrée par e-mail, à dépenser en une ou plusieurs fois sur les gems, les kits et les formations éligibles.",
    en: "A gift card delivered by email, to spend in one go or several on eligible gems, kits and trainings.",
  },
  amounts: [2500, 5000, 7500, 10000, 15000, 20000],
  allowCustomAmount: true,
  minCents: 1500,
  maxCents: 50000,
  expiryMonths: 12,
  allowScheduledDelivery: true,
  fields: {
    recipientName: "required",
    recipientEmail: "required",
    senderName: "required",
    message: "optional",
  },
  messageMaxLength: 240,
  designs: [
    { id: "sparkle", enabled: true },
    { id: "blush", enabled: true },
    { id: "noir", enabled: true },
    { id: "mint", enabled: true },
    { id: "photo", enabled: false },
  ],
  defaultDesign: "sparkle",
  published: true,
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A readable promo code: no 0/O or 1/I, so it survives being read aloud. */
export function randomCode(prefix = ""): string {
  const body = Array.from({ length: 8 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  return `${prefix}${body}`;
}

export function newPromotionId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return `${slug || "promotion"}-${Math.random().toString(36).slice(2, 6)}`;
}

export function blankPromotion(campaignId: string | null = null): Promotion {
  return {
    id: "",
    name: "",
    internalDescription: "",
    customerTitle: { fr: "", en: "" },
    customerDescription: { fr: "", en: "" },
    discount: { type: "percentage", percent: 20, maxDiscountCents: null },
    eligibility: { ...ALL_ELIGIBLE },
    usage: { ...DEFAULT_USAGE },
    schedule: { startsAt: "2027-12-01T00:00", endsAt: "2027-12-15T23:59", timezone: "Europe/Paris" },
    code: { ...AUTOMATIC },
    campaignId,
    lifecycle: "draft",
    stats: NO_STATS,
    createdAt: PROMO_NOW,
    createdBy: "",
    updatedAt: PROMO_NOW,
    updatedBy: "",
  };
}

export function blankCampaign(): Campaign {
  return {
    id: "",
    name: "",
    internalDescription: "",
    title: { fr: "", en: "" },
    description: { fr: "", en: "" },
    startsAt: "2027-12-01T00:00",
    endsAt: "2027-12-26T23:59",
    theme: "sparkle",
    cover: "img-05.jpg",
    productIds: [],
    lifecycle: "draft",
    activity: [],
    createdAt: PROMO_NOW,
    updatedAt: PROMO_NOW,
  };
}

/** Photos an administrator can pick as a campaign cover. */
export const COVER_LIBRARY = ["img-05.jpg", "img-13.jpg", "img-19.jpg", "img-02.jpg", "img-20.jpg", "mouth-03.jpg", "mouth-01.jpg", "img-12.jpg", "img-07.jpg"];
