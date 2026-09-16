/**
 * Mock data for the Loyalty Club prototype.
 *
 * Nothing here is awarded, stored or redeemed. The loyalty programme has no
 * backend: these are the states the interface has to be able to show, so the
 * card, the checkout banner and the marketing page can be reviewed against real
 * copy before any of it is wired to orders.
 *
 * Only language-neutral numbers live here. Every string the member reads is in
 * the locale files, like the rest of the UI.
 */

/** Stamps on one full card. */
export const STAMPS_PER_CARD = 5;
/** Minimum order value that earns one stamp, in euros. */
export const QUALIFYING_AMOUNT = 20;
/** Discount a full card unlocks, in percent. */
export const REWARD_PERCENT = 10;

/**
 * The five states, as a union rather than a stamp count: "start" and "renewed"
 * are both zero stamps and differ only in what the member is told, so a number
 * on its own could never tell them apart.
 */
export type LoyaltyStateId = "start" | "collecting" | "oneAway" | "unlocked" | "renewed";

export interface LoyaltyState {
  id: LoyaltyStateId;
  stamps: number;
  /** A complete card: the discount is waiting for the next order. */
  rewardReady: boolean;
}

export const LOYALTY_STATES: Record<LoyaltyStateId, LoyaltyState> = {
  start: { id: "start", stamps: 0, rewardReady: false },
  collecting: { id: "collecting", stamps: 3, rewardReady: false },
  oneAway: { id: "oneAway", stamps: 4, rewardReady: false },
  unlocked: { id: "unlocked", stamps: STAMPS_PER_CARD, rewardReady: true },
  renewed: { id: "renewed", stamps: 0, rewardReady: false },
};

/** Order of the demo switcher: the journey as a member would live it. */
export const LOYALTY_STATE_ORDER: LoyaltyStateId[] = ["start", "collecting", "oneAway", "unlocked", "renewed"];

/** What the member area opens on — the brief's mock customer, three of five. */
export const DEFAULT_LOYALTY_STATE: LoyaltyStateId = "collecting";

/** Qualifying purchases still needed to complete the card. */
export function stampsRemaining(state: LoyaltyState): number {
  return Math.max(0, STAMPS_PER_CARD - state.stamps);
}

/**
 * Mock cart subtotals for the checkout banner preview on the marketing page.
 * The real checkout reads the real cart; these only feed the demo tiles.
 */
export const DEMO_CART_BELOW = 12.5;
export const DEMO_CART_ABOVE = 34;
