import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { useLoyalty } from "./loyalty";
import {
  ACTIVITY_SECTIONS,
  activitySectionAt,
  loyaltyFingerprints,
  orderFingerprints,
  parseSeenState,
  reviewFingerprints,
  seenStorageKey,
  unseenCount,
  type ActivitySection,
  type SeenState,
} from "./memberActivity";
import { useOrders } from "./orders";
import { useReviewRequests, useReviews } from "./reviews";

export type MemberActivity = Record<ActivitySection, number>;

const NONE: MemberActivity = { orders: 0, reviews: 0, loyalty: 0 };

/**
 * New things per member-space section (see `memberActivity.ts`), for the
 * menu's badges. Being on a section marks what it holds seen. Reads the
 * browser's storage in an effect only, so the first render is the server's.
 */
export function useMemberActivity(pathname: string): MemberActivity {
  const { userId } = useAuth();
  const { orders, status: ordersStatus } = useOrders();
  const { reviews, loading: reviewsLoading } = useReviews();
  const requests = useReviewRequests();
  const { card, status: loyaltyStatus } = useLoyalty();
  const [seen, setSeen] = useState<{ owner: string; state: SeenState } | null>(null);

  // A section's fingerprints once its data has answered; null while it has not.
  const ordersKey = ordersStatus === "ready" ? orderFingerprints(orders).join("\n") : null;
  const reviewsKey = reviewsLoading ? null : reviewFingerprints(reviews, requests).join("\n");
  const loyaltyKey = loyaltyStatus === "ready" ? loyaltyFingerprints(card).join("\n") : null;
  const current = useMemo<Partial<Record<ActivitySection, string[]>>>(() => {
    const split = (key: string | null) => (key === null ? undefined : key ? key.split("\n") : []);
    return { orders: split(ordersKey), reviews: split(reviewsKey), loyalty: split(loyaltyKey) };
  }, [ordersKey, reviewsKey, loyaltyKey]);

  useEffect(() => {
    if (!userId) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(seenStorageKey(userId));
    } catch {
      // Storage blocked: every section starts as seen and stays quiet.
    }
    setSeen({ owner: userId, state: parseSeenState(raw) });
  }, [userId]);

  const own = userId && seen?.owner === userId ? seen.state : null;
  const here = activitySectionAt(pathname);

  // First sight of a section on this browser, or being on it: what it holds is seen.
  useEffect(() => {
    if (!userId || !own) return;
    let next: SeenState | null = null;
    for (const section of ACTIVITY_SECTIONS) {
      const now = current[section];
      if (!now) continue;
      const before = own[section];
      if (before === undefined || (section === here && unseenCount(now, before) > 0)) {
        next = { ...(next ?? own), [section]: now };
      }
    }
    if (!next) return;
    setSeen({ owner: userId, state: next });
    try {
      window.localStorage.setItem(seenStorageKey(userId), JSON.stringify(next));
    } catch {
      // Not kept: the badges come back on the next visit, nothing worse.
    }
  }, [userId, own, current, here]);

  return useMemo(() => {
    if (!own) return NONE;
    return {
      orders: current.orders ? unseenCount(current.orders, own.orders) : 0,
      reviews: current.reviews ? unseenCount(current.reviews, own.reviews) : 0,
      loyalty: current.loyalty ? unseenCount(current.loyalty, own.loyalty) : 0,
    };
  }, [own, current]);
}
