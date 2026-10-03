import { useTranslation } from "react-i18next";
import { useFormat } from "./format";
import { stampsRemaining, type LoyaltyState } from "../data/loyalty";
import { useLoyalty } from "./loyalty";

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
 * It lives here rather than in the card because the member page and the marketing
 * page both need the same wording for the same state, and
 * two copies of it would drift apart. Money goes through `formatPrice`, so the
 * threshold reads "20 €" in French and "€20" in English instead of a hard-coded
 * symbol.
 */
export function useLoyaltyCopy(state: LoyaltyState): LoyaltyCopy {
  const { formatPrice } = useFormat();
  const { t } = useTranslation();
  const { programme } = useLoyalty();
  const values = {
    amount: formatPrice(programme.qualifyingAmount),
    percent: programme.rewardPercent,
    total: state.total,
    done: state.stamps,
    count: stampsRemaining(state),
  };

  return {
    badge: t(`loyalty.state.${state.id}.badge`, values),
    // The title counts stamps held, not stamps left: "1 tampon", never "1 tampons".
    title: t(`loyalty.state.${state.id}.title`, { ...values, count: state.stamps }),
    body: t(`loyalty.state.${state.id}.body`, values),
    cta: t(`loyalty.state.${state.id}.cta`, values),
  };
}
