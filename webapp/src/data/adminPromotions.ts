import type { Localized } from "./types";

/**
 * Types and pure rules behind the Promotions workspace (promotions and
 * campaigns). Gift cards are their own live domain (`lib/giftCards/`).
 *
 * The workspace reads and writes Supabase through `lib/adminPromotions.tsx`
 * (rows ↔ these shapes in `lib/promotionMapping.ts`); nothing here is data.
 *
 * Two rules shape it:
 *
 * - **Money is integer cents**, following the money rule in `AGENTS.md`.
 * - **Status is derived, never stored.** A promotion stores its lifecycle
 *   (draft, live, paused, archived) and its dates; "active", "scheduled" and
 *   "expired" are read off the calendar against the real clock. A badge can
 *   therefore never disagree with the schedule printed beside it. The same goes
 *   for campaigns. (`promotion_overview` derives the same status in SQL.)
 */

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
  /** Buy X get Y. */
  buyQty?: number;
  getQty?: number;
  /** Buy X get Y reward: 100 = free, 50 = half price. */
  rewardPercent?: number;
  /** Bundle: the products sold together and their joint price. */
  bundleProductIds?: string[];
  bundlePriceCents?: number;
  /** Gift with purchase: the product, and its option when it has some. */
  giftProductId?: string;
  giftVariantId?: string | null;
}

export interface Eligibility {
  scope: EligibilityScope;
  productIds: string[];
  categoryIds: string[];
  collectionIds: string[];
  customers: CustomerEligibility;
  segmentIds: string[];
  /** Minimum goods amount of the basket (gift cards excluded, before discounts), in cents. */
  minCartCents: number | null;
  minQuantity: number | null;
}

export interface UsageRules {
  maxTotal: number | null;
  maxPerCustomer: number | null;
  combinable: boolean;
  /** The loyalty reward may be added on top of this promotion (otherwise the better of the two applies). */
  combinableWithLoyalty: boolean;
  excludeDiscounted: boolean;
  excludedProductIds: string[];
}

export interface Schedule {
  /** Local date-time as typed, `YYYY-MM-DDTHH:mm`, in `timezone`. */
  startsAt: string;
  endsAt: string | null;
  timezone: Timezone;
}

export interface PromoCodeConfig {
  mode: "automatic" | "code";
  /** The shared code, or the prefix of the unique codes. Codes are always matched case-insensitively. */
  code: string;
  /** "One code for everyone" or "unique single-use codes". */
  kind: "shared" | "unique";
  /** Unique codes: how many exist (or are to exist once saved). */
  uniqueCount: number | null;
}

export interface PromotionStats {
  /** Paid orders that used the promotion. */
  uses: number;
  orders: number;
  revenueCents: number;
  discountCents: number;
  /** Uses per day over the last 14 days (oldest first). */
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
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Shared reference lists (read from Supabase)                                */
/* -------------------------------------------------------------------------- */

export interface Collection {
  id: string;
  name: Localized;
  productIds: string[];
}

export interface Segment {
  id: string;
  name: string;
  size: number;
}

/* -------------------------------------------------------------------------- */
/* Campaigns                                                                  */
/* -------------------------------------------------------------------------- */

export type CampaignLifecycle = "draft" | "live" | "paused" | "archived";
export type CampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "archived";
export const CAMPAIGN_STATUSES: CampaignStatus[] = ["active", "scheduled", "draft", "paused", "completed", "archived"];

/** Visual themes a campaign banner can wear. Tokens only, no hex in components. */
export type CampaignTheme = "sparkle" | "noir" | "blush" | "mint" | "winter";
export const CAMPAIGN_THEMES: CampaignTheme[] = ["sparkle", "noir", "blush", "mint", "winter"];

export interface Campaign {
  id: string;
  name: string;
  internalDescription: string;
  title: Localized;
  description: Localized;
  /** Local date-times, `YYYY-MM-DDTHH:mm`, in `timezone`. */
  startsAt: string;
  endsAt: string;
  timezone: Timezone;
  theme: CampaignTheme;
  /** A photo from the brand library, or null for a pure typographic banner. */
  cover: string | null;
  productIds: string[];
  lifecycle: CampaignLifecycle;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Derivations                                                                */
/* -------------------------------------------------------------------------- */

/** UTC offset (ms) of a time zone at an instant. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Milliseconds since epoch of a local date-time (`YYYY-MM-DD[THH:mm]`) read in a time zone, summer time included. */
export function toTime(local: string, timeZone: string = PROMO_TIMEZONE): number {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(local)) return new Date(local).getTime();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(local);
  if (!match) return Number.NaN;
  const [, y, mo, d, h = "00", mi = "00"] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  // The offset is read at the guess, then again at the corrected instant (across a change of hour).
  let instant = wall - zoneOffset(wall, timeZone);
  instant = wall - zoneOffset(instant, timeZone);
  return instant;
}

/** The inverse: an instant as the local `YYYY-MM-DDTHH:mm` of a time zone. */
export function toLocalInput(iso: string, timeZone: string = PROMO_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function promotionStatus(p: Pick<Promotion, "lifecycle" | "schedule">, now = Date.now()): PromotionStatus {
  if (p.lifecycle === "archived") return "archived";
  if (p.lifecycle === "draft") return "draft";
  const { startsAt, endsAt, timezone } = p.schedule;
  if (endsAt && toTime(endsAt, timezone) <= now) return "expired";
  if (p.lifecycle === "paused") return "paused";
  if (toTime(startsAt, timezone) > now) return "scheduled";
  return "active";
}

export function campaignStatus(c: Pick<Campaign, "lifecycle" | "startsAt" | "endsAt" | "timezone">, now = Date.now()): CampaignStatus {
  if (c.lifecycle === "archived") return "archived";
  if (c.lifecycle === "draft") return "draft";
  if (toTime(c.endsAt, c.timezone) <= now) return "completed";
  if (c.lifecycle === "paused") return "paused";
  if (toTime(c.startsAt, c.timezone) > now) return "scheduled";
  return "active";
}

/** Days between two stored dates, rounded. */
export function daysBetween(from: string, to: string, timeZone: string = PROMO_TIMEZONE): number {
  return Math.round((toTime(to, timeZone) - toTime(from, timeZone)) / 86_400_000);
}

export function daysFromNow(date: string, timeZone: string = PROMO_TIMEZONE): number {
  return Math.round((toTime(date, timeZone) - Date.now()) / 86_400_000);
}

/* -------------------------------------------------------------------------- */
/* Blank shells                                                               */
/* -------------------------------------------------------------------------- */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A readable promo code: no 0/O or 1/I, so it survives being read aloud. The database re-checks it is free. */
export function randomCode(prefix = ""): string {
  const body = Array.from({ length: 8 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  return `${prefix}${body}`;
}

/** Today at 00:00 plus some days, as a local date-time input value (shop time). */
export function localDay(offsetDays: number, time = "00:00"): string {
  return `${toLocalInput(new Date(Date.now() + offsetDays * 86_400_000).toISOString()).slice(0, 10)}T${time}`;
}

export function blankPromotion(campaignId: string | null = null): Promotion {
  return {
    id: "",
    name: "",
    internalDescription: "",
    customerTitle: { fr: "", en: "" },
    customerDescription: { fr: "", en: "" },
    discount: { type: "percentage", percent: 20, maxDiscountCents: null },
    eligibility: {
      scope: "all",
      productIds: [],
      categoryIds: [],
      collectionIds: [],
      customers: "all",
      segmentIds: [],
      minCartCents: null,
      minQuantity: null,
    },
    usage: { maxTotal: null, maxPerCustomer: 1, combinable: false, combinableWithLoyalty: false, excludeDiscounted: true, excludedProductIds: [] },
    schedule: { startsAt: localDay(1), endsAt: localDay(15, "23:59"), timezone: "Europe/Paris" },
    code: { mode: "automatic", code: "", kind: "shared", uniqueCount: null },
    campaignId,
    lifecycle: "draft",
    stats: { uses: 0, orders: 0, revenueCents: 0, discountCents: 0, daily: Array.from({ length: 14 }, () => 0) },
    createdAt: "",
    updatedAt: "",
  };
}

export function blankCampaign(): Campaign {
  return {
    id: "",
    name: "",
    internalDescription: "",
    title: { fr: "", en: "" },
    description: { fr: "", en: "" },
    startsAt: localDay(1),
    endsAt: localDay(26, "23:59"),
    timezone: "Europe/Paris",
    theme: "sparkle",
    cover: "img-05.jpg",
    productIds: [],
    lifecycle: "draft",
    createdAt: "",
    updatedAt: "",
  };
}

/** Photos an administrator can pick as a campaign cover (the brand library; `campaigns.cover_path` keeps the file name). */
export const COVER_LIBRARY = ["img-05.jpg", "img-13.jpg", "img-19.jpg", "img-02.jpg", "img-20.jpg", "mouth-03.jpg", "mouth-01.jpg", "img-12.jpg", "img-07.jpg"];
