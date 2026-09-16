import { useTranslation } from "react-i18next";
import { formatPrice } from "./format";
import {
  QUALIFYING_AMOUNT,
  REWARD_PERCENT,
  STAMPS_PER_CARD,
  stampsRemaining,
  type LoyaltyState,
} from "../data/loyalty";

export interface LoyaltyCopy {
  /** Short status label for the corner of the card. */
  badge: string;
  title: string;
  body: string;
  cta: string;
}

/**
 * The sentence set for one loyalty state, in the current language.
 *
 * It lives here rather than in the card because the member page, the marketing
 * page and the demo switcher all need the same wording for the same state, and
 * three copies of it would drift apart. Money goes through `formatPrice`, so the
 * threshold reads "20 €" in French and "€20" in English instead of a hard-coded
 * symbol.
 */
export function useLoyaltyCopy(state: LoyaltyState): LoyaltyCopy {
  const { t } = useTranslation();
  const values = {
    amount: formatPrice(QUALIFYING_AMOUNT),
    percent: REWARD_PERCENT,
    total: STAMPS_PER_CARD,
    done: state.stamps,
    count: stampsRemaining(state),
  };

  return {
    badge: t(`loyalty.state.${state.id}.badge`, values),
    title: t(`loyalty.state.${state.id}.title`, values),
    body: t(`loyalty.state.${state.id}.body`, values),
    cta: t(`loyalty.state.${state.id}.cta`, values),
  };
}
