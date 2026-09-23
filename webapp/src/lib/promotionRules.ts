import {
  COLLECTIONS,
  NOW_TIME,
  campaignStatus,
  giftCardBalance,
  giftCardInitial,
  giftCardStatus,
  promotionStatus,
  toTime,
  type Campaign,
  type GiftCard,
  type GiftCardStatus,
  type DeliveryStatus,
  type Promotion,
  type PromotionStatus,
  type PromotionType,
} from "../data/adminPromotions";

/**
 * Business rules of the Promotions workspace as pure functions.
 *
 * Nothing here touches React, so the list, the detail page, the editor's live
 * checklist and the storefront previews all read the same answer. In a real
 * implementation every one of these rules is re-checked on the server: a
 * discount the browser computed is a suggestion, never a price.
 */

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type IssueField =
  | "name"
  | "customerTitle"
  | "percent"
  | "amount"
  | "buyGet"
  | "bundle"
  | "gift"
  | "scope"
  | "segments"
  | "schedule"
  | "code"
  | "usage";

export interface Issue {
  field: IssueField;
  /** Translation key under `promo.validation`. */
  key: string;
  /** Which form section owns it, for the checklist's "go to" links. */
  section: "basics" | "discount" | "eligibility" | "usage" | "schedule" | "code";
}

export function validatePromotion(p: Promotion): Issue[] {
  const issues: Issue[] = [];
  if (!p.name.trim()) issues.push({ field: "name", key: "nameRequired", section: "basics" });
  if (!p.customerTitle.fr.trim() && !p.customerTitle.en.trim())
    issues.push({ field: "customerTitle", key: "titleRequired", section: "basics" });

  const d = p.discount;
  if (d.type === "percentage" && (!d.percent || d.percent < 1 || d.percent > 100))
    issues.push({ field: "percent", key: "percentRange", section: "discount" });
  if (d.type === "fixed" && (!d.amountCents || d.amountCents <= 0))
    issues.push({ field: "amount", key: "amountRequired", section: "discount" });
  if (d.type === "bxgy" && (!d.buyQty || !d.getQty || d.buyQty < 1 || d.getQty < 1))
    issues.push({ field: "buyGet", key: "buyGetRequired", section: "discount" });
  if (d.type === "bundle" && ((d.bundleProductIds?.length ?? 0) < 2 || !d.bundlePriceCents))
    issues.push({ field: "bundle", key: "bundleRequired", section: "discount" });
  if (d.type === "gift" && !d.giftProductId) issues.push({ field: "gift", key: "giftRequired", section: "discount" });

  const e = p.eligibility;
  if (
    (e.scope === "products" && e.productIds.length === 0) ||
    (e.scope === "categories" && e.categoryIds.length === 0) ||
    (e.scope === "collections" && e.collectionIds.length === 0)
  )
    issues.push({ field: "scope", key: "scopeEmpty", section: "eligibility" });
  if (e.customers === "segments" && e.segmentIds.length === 0)
    issues.push({ field: "segments", key: "segmentsEmpty", section: "eligibility" });

  if (!p.schedule.startsAt) issues.push({ field: "schedule", key: "startRequired", section: "schedule" });
  else if (p.schedule.endsAt && toTime(p.schedule.endsAt) <= toTime(p.schedule.startsAt))
    issues.push({ field: "schedule", key: "endBeforeStart", section: "schedule" });

  if (p.code.mode === "code") {
    if (!p.code.code.trim()) issues.push({ field: "code", key: "codeRequired", section: "code" });
    else if (!/^[A-Za-z0-9_-]{4,24}$/.test(p.code.code.trim()))
      issues.push({ field: "code", key: "codeFormat", section: "code" });
  }

  if (p.usage.maxTotal != null && p.usage.maxPerCustomer != null && p.usage.maxPerCustomer > p.usage.maxTotal)
    issues.push({ field: "usage", key: "perCustomerAboveTotal", section: "usage" });

  return issues;
}

/** Codes are unique across promotions that can still run. */
export function codeTaken(code: string, promotions: Promotion[], selfId: string): boolean {
  const wanted = code.trim().toUpperCase();
  if (!wanted) return false;
  return promotions.some(
    (p) =>
      p.id !== selfId &&
      p.code.mode === "code" &&
      p.code.code.toUpperCase() === wanted &&
      promotionStatus(p) !== "archived" &&
      promotionStatus(p) !== "expired",
  );
}

/* -------------------------------------------------------------------------- */
/* Money                                                                      */
/* -------------------------------------------------------------------------- */

/** Cents to euros for display only. Never feed the result back into arithmetic. */
export function euros(cents: number): number {
  return cents / 100;
}

/** Parses a typed euro amount ("12,50") into cents; null when empty or invalid. */
export function parseEuros(value: string): number | null {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Typed input value for a cents amount: "12.5" rather than "12.50" or "1250". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return String(cents / 100);
}

/**
 * The price a product shows while a promotion applies to it on its own, in
 * cents. Only percentage and fixed-amount promotions change a unit price; the
 * other types act on the cart and leave the card's price alone.
 */
export function discountedUnitCents(priceCents: number, p: Promotion): number {
  const d = p.discount;
  if (d.type === "percentage" && d.percent) {
    let off = Math.round((priceCents * d.percent) / 100);
    if (d.maxDiscountCents) off = Math.min(off, d.maxDiscountCents);
    return Math.max(0, priceCents - off);
  }
  if (d.type === "fixed" && d.amountCents && !d.minOrderCents) return Math.max(0, priceCents - d.amountCents);
  return priceCents;
}

/* -------------------------------------------------------------------------- */
/* Scope                                                                      */
/* -------------------------------------------------------------------------- */

/** Product ids a promotion covers, or null for "every product". */
export function coveredProductIds(
  p: Promotion,
  productsByCategory: (categoryId: string) => string[],
): string[] | null {
  const e = p.eligibility;
  if (p.discount.type === "bundle") return p.discount.bundleProductIds ?? [];
  switch (e.scope) {
    case "all":
      return null;
    case "products":
      return e.productIds;
    case "categories":
      return e.categoryIds.flatMap(productsByCategory);
    case "collections":
      return e.collectionIds.flatMap((id) => COLLECTIONS.find((c) => c.id === id)?.productIds ?? []);
  }
}

/* -------------------------------------------------------------------------- */
/* Campaign roll-ups                                                          */
/* -------------------------------------------------------------------------- */

export interface CampaignRollup {
  promotions: Promotion[];
  revenueCents: number;
  orders: number;
  uses: number;
  discountCents: number;
}

export function campaignRollup(campaign: Campaign, promotions: Promotion[]): CampaignRollup {
  const own = promotions.filter((p) => p.campaignId === campaign.id);
  return {
    promotions: own,
    revenueCents: own.reduce((s, p) => s + p.stats.revenueCents, 0),
    orders: own.reduce((s, p) => s + p.stats.orders, 0),
    uses: own.reduce((s, p) => s + p.stats.uses, 0),
    discountCents: own.reduce((s, p) => s + p.stats.discountCents, 0),
  };
}

/* -------------------------------------------------------------------------- */
/* Overview KPIs                                                              */
/* -------------------------------------------------------------------------- */

export interface PromotionOverview {
  active: number;
  scheduled: number;
  expired: number;
  activeCampaigns: number;
  revenueCents: number;
  orders: number;
  giftCardRevenueCents: number;
  giftCardsSold: number;
  endingSoon: number;
}

export function overview(promotions: Promotion[], campaigns: Campaign[], cards: GiftCard[]): PromotionOverview {
  const statuses = promotions.map((p) => promotionStatus(p));
  return {
    active: statuses.filter((s) => s === "active").length,
    scheduled: statuses.filter((s) => s === "scheduled").length,
    expired: statuses.filter((s) => s === "expired").length,
    activeCampaigns: campaigns.filter((c) => campaignStatus(c) === "active").length,
    revenueCents: promotions.reduce((s, p) => s + p.stats.revenueCents, 0),
    orders: promotions.reduce((s, p) => s + p.stats.orders, 0),
    giftCardRevenueCents: cards.filter((c) => !c.cancelled).reduce((s, c) => s + giftCardInitial(c), 0),
    giftCardsSold: cards.filter((c) => !c.cancelled).length,
    endingSoon: promotions.filter(
      (p) =>
        promotionStatus(p) === "active" &&
        p.schedule.endsAt &&
        toTime(p.schedule.endsAt) - NOW_TIME < 7 * 86_400_000,
    ).length,
  };
}

export interface GiftCardMetrics {
  sold: number;
  revenueCents: number;
  outstandingCents: number;
  redeemedCents: number;
  unredeemedCents: number;
  expired: number;
  expiredValueCents: number;
}

export function giftCardMetrics(cards: GiftCard[]): GiftCardMetrics {
  const live = cards.filter((c) => !c.cancelled);
  const revenueCents = live.reduce((s, c) => s + giftCardInitial(c), 0);
  const redeemedCents = live.reduce(
    (s, c) => s + c.ledger.filter((t) => t.kind === "redemption").reduce((a, t) => a - t.amountCents, 0),
    0,
  );
  const expiredCards = live.filter((c) => giftCardStatus(c) === "expired");
  const outstandingCents = live
    .filter((c) => giftCardStatus(c) !== "expired")
    .reduce((s, c) => s + Math.max(0, giftCardBalance(c)), 0);
  const expiredValueCents = expiredCards.reduce((s, c) => s + giftCardBalance(c), 0);
  return {
    sold: live.length,
    revenueCents,
    outstandingCents,
    redeemedCents,
    unredeemedCents: outstandingCents + expiredValueCents,
    expired: expiredCards.length,
    expiredValueCents,
  };
}

/* -------------------------------------------------------------------------- */
/* List filtering                                                             */
/* -------------------------------------------------------------------------- */

export type PromotionTab = "all" | "active" | "scheduled" | "expired" | "campaigns" | "giftCards";
export const PROMOTION_TABS: PromotionTab[] = ["all", "active", "scheduled", "expired", "campaigns", "giftCards"];

export type PromotionSort = "newest" | "performance" | "expiration" | "name";
export const PROMOTION_SORTS: PromotionSort[] = ["newest", "performance", "expiration", "name"];

export interface PromotionFilters {
  query: string;
  statuses: PromotionStatus[];
  type: PromotionType | "all";
  campaign: string; // "all" | "none" | id
  product: string; // "all" | id
  from: string;
  to: string;
  sort: PromotionSort;
}

export const EMPTY_PROMOTION_FILTERS: PromotionFilters = {
  query: "",
  statuses: [],
  type: "all",
  campaign: "all",
  product: "all",
  from: "",
  to: "",
  sort: "newest",
};

export function activePromotionFilterCount(f: PromotionFilters): number {
  return (
    (f.query ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.type !== "all" ? 1 : 0) +
    (f.campaign !== "all" ? 1 : 0) +
    (f.product !== "all" ? 1 : 0) +
    (f.from || f.to ? 1 : 0)
  );
}

/** Statuses a tab stands for. "All" hides archived rows unless asked for. */
export function tabStatuses(tab: PromotionTab): PromotionStatus[] | null {
  switch (tab) {
    case "active":
      return ["active"];
    case "scheduled":
      return ["scheduled"];
    case "expired":
      return ["expired"];
    default:
      return null;
  }
}

export function filterPromotions(
  promotions: Promotion[],
  f: PromotionFilters,
  tab: PromotionTab,
  campaignName: (id: string) => string,
  productsByCategory: (categoryId: string) => string[],
): Promotion[] {
  const q = f.query.trim().toLowerCase();
  const tabOnly = tabStatuses(tab);
  const from = f.from ? toTime(f.from) : null;
  const to = f.to ? toTime(`${f.to}T23:59`) : null;

  const out = promotions.filter((p) => {
    const status = promotionStatus(p);
    if (tabOnly && !tabOnly.includes(status)) return false;
    if (!tabOnly && f.statuses.length === 0 && status === "archived") return false;
    if (f.statuses.length && !f.statuses.includes(status)) return false;
    if (f.type !== "all" && p.discount.type !== f.type) return false;
    if (f.campaign === "none" && p.campaignId) return false;
    if (f.campaign !== "all" && f.campaign !== "none" && p.campaignId !== f.campaign) return false;
    if (f.product !== "all") {
      const covered = coveredProductIds(p, productsByCategory);
      if (covered && !covered.includes(f.product)) return false;
    }
    // Date window: keep promotions whose run overlaps it.
    if (from != null || to != null) {
      const start = toTime(p.schedule.startsAt);
      const end = p.schedule.endsAt ? toTime(p.schedule.endsAt) : Number.POSITIVE_INFINITY;
      if (from != null && end < from) return false;
      if (to != null && start > to) return false;
    }
    if (q) {
      const hay = [
        p.name,
        p.code.code,
        p.customerTitle.fr,
        p.customerTitle.en,
        p.campaignId ? campaignName(p.campaignId) : "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const endOf = (p: Promotion) => (p.schedule.endsAt ? toTime(p.schedule.endsAt) : Number.POSITIVE_INFINITY);
  return out.sort((a, b) => {
    switch (f.sort) {
      case "performance":
        return b.stats.revenueCents - a.stats.revenueCents;
      case "expiration": {
        // Soonest-ending live promotion first; finished ones sink.
        const aPast = endOf(a) < NOW_TIME;
        const bPast = endOf(b) < NOW_TIME;
        if (aPast !== bPast) return aPast ? 1 : -1;
        return aPast ? endOf(b) - endOf(a) : endOf(a) - endOf(b);
      }
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return toTime(b.createdAt) - toTime(a.createdAt);
    }
  });
}

export type GiftCardSort = "newest" | "balance" | "expiry";

export interface GiftCardFilters {
  query: string;
  status: GiftCardStatus | "all";
  delivery: DeliveryStatus | "all";
  sort: GiftCardSort;
}

export const EMPTY_GIFT_CARD_FILTERS: GiftCardFilters = { query: "", status: "all", delivery: "all", sort: "newest" };

export function filterGiftCards(cards: GiftCard[], f: GiftCardFilters): GiftCard[] {
  const q = f.query.trim().toLowerCase().replace(/[\s-]/g, "");
  return cards
    .filter((c) => {
      if (f.status !== "all" && giftCardStatus(c) !== f.status) return false;
      if (f.delivery !== "all" && c.delivery !== f.delivery) return false;
      if (q) {
        const hay = [c.code, c.recipientName, c.recipientEmail, c.purchaserName, c.purchaserEmail, c.orderRef]
          .join(" ")
          .toLowerCase()
          .replace(/[\s-]/g, "");
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (f.sort === "balance") return giftCardBalance(b) - giftCardBalance(a);
      if (f.sort === "expiry") return toTime(a.expiresAt) - toTime(b.expiresAt);
      return toTime(b.purchasedAt) - toTime(a.purchasedAt);
    });
}

/** "GTGC-7K2M-Q9XA" → "GTGC-••••-Q9XA", for places a full code has no business being. */
export function maskCode(code: string): string {
  const parts = code.split("-");
  if (parts.length < 3) return code;
  return [parts[0], ...parts.slice(1, -1).map(() => "••••"), parts[parts.length - 1]].join("-");
}
