import type { Order } from "../data/orders";
import { subjectKey, type CustomerReview, type ReviewSubject } from "../data/reviewSystem";

/**
 * "Something new" beside the member space's menu entries — orders, reviews,
 * loyalty — the way the lounge already shows its unread activity.
 *
 * Each section is reduced to a set of fingerprints, one per thing the member
 * would want to look at again: an order changes fingerprint when its status,
 * a parcel or a refund moves; a review when the team publishes it, asks for
 * changes, turns it down or answers it; a purchase waiting for a review when
 * it appears; a full loyalty card when it completes. Visiting a section marks
 * its fingerprints seen; what is not in the seen set is new.
 *
 * Pure UX: the seen sets live in the browser (`localStorage`, per account).
 * A section never seen on this browser starts from what it holds now, so a
 * new device does not light every entry up.
 */

export type ActivitySection = "orders" | "reviews" | "loyalty";

export const ACTIVITY_SECTIONS: readonly ActivitySection[] = ["orders", "reviews", "loyalty"];

/** Where each section lives: being on it (or under it) marks it seen. */
export const ACTIVITY_PATHS: Record<ActivitySection, string> = {
  orders: "/compte/commandes",
  reviews: "/compte/avis",
  loyalty: "/compte/fidelite",
};

export type SeenState = Partial<Record<ActivitySection, string[]>>;

export function orderFingerprints(orders: Order[]): string[] {
  return orders.map((order) =>
    [
      "order",
      order.reference,
      order.status,
      order.fulfilment,
      order.parcels.map((parcel) => `${parcel.id}:${parcel.status}`).join(","),
      order.refunds.map((refund) => refund.status).join(","),
    ].join("|"),
  );
}

export function reviewFingerprints(reviews: CustomerReview[], requests: { subject: ReviewSubject }[]): string[] {
  const own = reviews
    .filter((review) => review.mine)
    .map((review) => ["review", review.id, review.status, review.response ? "answered" : ""].join("|"));
  return [...own, ...requests.map((request) => `request|${subjectKey(request.subject)}`)];
}

/** A full card waiting to be spent; `lifetime` tells one completed card from the next. */
export function loyaltyFingerprints(card: { rewardReady: boolean; lifetime: number } | null): string[] {
  return card?.rewardReady ? [`reward|${card.lifetime}`] : [];
}

/** How many current fingerprints the member has not seen; none for a section never seen here. */
export function unseenCount(current: readonly string[], seen: readonly string[] | undefined): number {
  if (!seen) return 0;
  const known = new Set(seen);
  return current.filter((fingerprint) => !known.has(fingerprint)).length;
}

/** The section a pathname belongs to, if it is one of the tracked ones. */
export function activitySectionAt(pathname: string): ActivitySection | null {
  return (
    ACTIVITY_SECTIONS.find((section) => {
      const path = ACTIVITY_PATHS[section];
      return pathname === path || pathname.startsWith(`${path}/`);
    }) ?? null
  );
}

/** Reads the seen sets kept for one account; anything malformed counts as never seen. */
export function parseSeenState(raw: string | null): SeenState {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return {};
    const state: SeenState = {};
    for (const section of ACTIVITY_SECTIONS) {
      const list = (value as Record<string, unknown>)[section];
      if (Array.isArray(list) && list.every((item) => typeof item === "string")) state[section] = list;
    }
    return state;
  } catch {
    return {};
  }
}

export function seenStorageKey(userId: string): string {
  return `gt-member-seen:${userId}`;
}
