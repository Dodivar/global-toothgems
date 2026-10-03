/**
 * Shapes and pure helpers for the Loyalty Club.
 *
 * The programme's rules live in `loyalty_settings` and the member's card in
 * `loyalty_overview` (read by `lib/loyalty.tsx`); stamps are awarded by the
 * database when a Stripe payment is confirmed, never by the browser. This file
 * holds only language-neutral types, the card-state rules, and the example cards
 * the marketing pages draw to explain the programme. Every string a member reads
 * is in the locale files.
 */

/** The programme's rules, as `loyalty_settings` stores them. Amounts are major units. */
export interface LoyaltyProgramme {
  /** Stamps on one full card. */
  stampsPerCard: number;
  /** Minimum value of the goods in one order to earn a stamp. */
  qualifyingAmount: number;
  /** Discount a full card unlocks, in percent. */
  rewardPercent: number;
  currency: string;
  active: boolean;
}

/**
 * The rules the project ships with (the row seeded in `loyalty_settings`).
 * Used for the first paint of a server-rendered page, until the stored rules
 * are read; never as a stand-in for a member's card.
 */
export const DEFAULT_PROGRAMME: LoyaltyProgramme = {
  stampsPerCard: 5,
  qualifyingAmount: 20,
  rewardPercent: 10,
  currency: "EUR",
  active: true,
};

/**
 * The five states, as a union rather than a stamp count: "start" and "renewed"
 * are both zero stamps and differ only in what the member is told, so a number
 * on its own could never tell them apart.
 */
export type LoyaltyStateId = "start" | "collecting" | "oneAway" | "unlocked" | "renewed";

export interface LoyaltyState {
  id: LoyaltyStateId;
  /** Stamps inked on the card being shown. */
  stamps: number;
  /** Stamps the card holds when full (a snapshot of the rule at the card's creation). */
  total: number;
  /** A complete card: the discount is waiting for the next order. */
  rewardReady: boolean;
}

/** Order of the example cards on the public page: the journey as a member lives it. */
export const LOYALTY_STATE_ORDER: LoyaltyStateId[] = ["start", "collecting", "oneAway", "unlocked", "renewed"];

/** Qualifying purchases still needed to complete the card. */
export function stampsRemaining(state: LoyaltyState): number {
  return Math.max(0, state.total - state.stamps);
}

/**
 * The state a card is in, from the figures the database keeps: stamps on the
 * card being collected, rewards waiting on completed cards, cards already
 * redeemed. A waiting reward outranks everything; an empty card is "renewed"
 * only once a card has been redeemed.
 */
export function deriveLoyaltyState(figures: {
  currentStamps: number;
  total: number;
  rewardsAvailable: number;
  cardsRedeemed: number;
}): LoyaltyState {
  const { currentStamps, total, rewardsAvailable, cardsRedeemed } = figures;
  if (rewardsAvailable > 0) return { id: "unlocked", stamps: total, total, rewardReady: true };
  const stamps = Math.min(Math.max(0, currentStamps), total);
  const id: LoyaltyStateId =
    stamps === 0 ? (cardsRedeemed > 0 ? "renewed" : "start") : stamps === total - 1 ? "oneAway" : "collecting";
  return { id, stamps, total, rewardReady: false };
}

/**
 * An example card for the marketing pages (the programme page, the home band).
 * It explains the programme; it is never presented as a member's own card.
 */
export function exampleLoyaltyState(id: LoyaltyStateId, total: number): LoyaltyState {
  const stamps =
    id === "unlocked" ? total : id === "oneAway" ? Math.max(0, total - 1) : id === "collecting" ? Math.min(3, Math.max(1, total - 2)) : 0;
  return { id, stamps, total, rewardReady: id === "unlocked" };
}
