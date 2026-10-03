import {
  DEFAULT_PROGRAMME,
  deriveLoyaltyState,
  type LoyaltyProgramme,
  type LoyaltyState,
} from "../data/loyalty";

/**
 * Row ↔ UI mapping for the Loyalty Club: pure, so the rules the card relies on
 * are unit-tested. Rows are what `loyalty_settings` (public) and
 * `loyalty_overview` (the member's own row, by RLS) return.
 */

export const LOYALTY_SETTINGS_SELECT = "is_active, stamps_per_card, qualifying_amount, reward_percent, currency";
export const LOYALTY_OVERVIEW_SELECT =
  "current_stamps, stamps_required, rewards_available, cards_redeemed, stamps_lifetime";

export interface LoyaltySettingsRow {
  is_active: boolean;
  stamps_per_card: number;
  qualifying_amount: number | string;
  reward_percent: number;
  currency: string;
}

export interface LoyaltyOverviewRow {
  current_stamps: number | string | null;
  stamps_required: number | string | null;
  rewards_available: number | string | null;
  cards_redeemed: number | string | null;
  stamps_lifetime: number | string | null;
}

/** PostgREST returns `count(*)` as a number or a string depending on the column type. */
function whole(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function mapProgramme(row: LoyaltySettingsRow): LoyaltyProgramme {
  const amount = Number(row.qualifying_amount);
  return {
    stampsPerCard: row.stamps_per_card,
    qualifyingAmount: Number.isFinite(amount) ? amount : DEFAULT_PROGRAMME.qualifyingAmount,
    rewardPercent: row.reward_percent,
    currency: row.currency,
    active: row.is_active,
  };
}

/** The member's card. `lifetime` is every stamp ever earned and not voided. */
export function mapOverview(row: LoyaltyOverviewRow, programme: LoyaltyProgramme): LoyaltyState & { lifetime: number } {
  const total = whole(row.stamps_required) || programme.stampsPerCard;
  return {
    ...deriveLoyaltyState({
      currentStamps: whole(row.current_stamps),
      total,
      rewardsAvailable: whole(row.rewards_available),
      cardsRedeemed: whole(row.cards_redeemed),
    }),
    lifetime: whole(row.stamps_lifetime),
  };
}

/**
 * Value of a basket that counts towards a stamp, in minor units: shop goods
 * only. Gift cards and courses never earn a stamp (the database applies the
 * same rule when the order is paid).
 */
export function qualifyingSubtotal(lines: { unitPrice: number; qty: number; giftCard?: unknown; courseId?: string | null }[]): number {
  return lines.reduce((sum, l) => (l.giftCard || l.courseId ? sum : sum + l.unitPrice * l.qty), 0);
}
