import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { SectionHeader } from "../../components/account/SectionHeader";
import { LoyaltyCard } from "../../components/loyalty/LoyaltyCard";
import { LoyaltyReward } from "../../components/loyalty/LoyaltyReward";
import { LoyaltySteps } from "../../components/loyalty/LoyaltySteps";
import { LoyaltyStateDemo } from "../../components/loyalty/LoyaltyStateDemo";
import { CheckoutLoyaltyBanner } from "../../components/loyalty/CheckoutLoyaltyBanner";
import { useLoyaltyCopy } from "../../lib/loyaltyCopy";
import { formatPrice } from "../../lib/format";
import {
  DEFAULT_LOYALTY_STATE,
  DEMO_CART_ABOVE,
  DEMO_CART_BELOW,
  LOYALTY_STATES,
  QUALIFYING_AMOUNT,
  REWARD_PERCENT,
  STAMPS_PER_CARD,
  type LoyaltyStateId,
} from "../../data/loyalty";

/**
 * The member's loyalty card.
 *
 * The card state is local component state seeded from the mock data, because
 * there is no loyalty backend: nothing is fetched, nothing is saved, and
 * switching states here changes only what this page is drawing. The demo
 * controls sit below the member-facing content, in their own dashed panel, so
 * the production surface reads as production even while it is a prototype.
 */
export function Loyalty() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [stateId, setStateId] = useState<LoyaltyStateId>(DEFAULT_LOYALTY_STATE);
  const state = LOYALTY_STATES[stateId];
  const copy = useLoyaltyCopy(state);

  return (
    <>
      <section className="grid gap-5">
        <SectionHeader
          icon={Sparkles}
          eyebrow={t("loyalty.clubName")}
          title={t("loyalty.memberTitle")}
          description={t("loyalty.memberBody", {
            total: STAMPS_PER_CARD,
            amount: formatPrice(QUALIFYING_AMOUNT),
            percent: REWARD_PERCENT,
          })}
        />

        <LoyaltyCard
          state={state}
          action={
            <Button
              variant={state.rewardReady ? "primary" : "outline"}
              size="sm"
              iconRight={ArrowRight}
              onClick={() => navigate("/boutique")}
            >
              {copy.cta}
            </Button>
          }
        />

        {state.rewardReady && (
          <LoyaltyReward
            title={t("loyalty.rewardPanelTitle", { percent: REWARD_PERCENT })}
            body={t("loyalty.rewardPanelBody", { percent: REWARD_PERCENT })}
          />
        )}
      </section>

      <section className="grid gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-2">
            <span className="gt-eyebrow">{t("loyalty.howEyebrow")}</span>
            <h2 className="text-[length:var(--text-h3)]">{t("loyalty.howTitle")}</h2>
          </div>
          <Link
            to="/fidelite"
            className="inline-flex items-center gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)] underline decoration-1 underline-offset-4 hover:text-[var(--text-primary)]"
          >
            {t("loyalty.aboutLink")}
            <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </div>
        <LoyaltySteps />
      </section>

      {/* Everything below is preview scaffolding, not the member's own card. */}
      <section aria-labelledby="gt-loyalty-demo" className="grid gap-4 border-t border-dashed border-[var(--border-default)] pt-8">
        <h2 id="gt-loyalty-demo" className="text-[length:var(--text-h4)] text-[var(--text-muted)]">
          {t("loyalty.demoHeading")}
        </h2>

        <LoyaltyStateDemo value={stateId} onChange={setStateId} />

        <div className="grid gap-4">
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("loyalty.demoCheckoutNote")}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <CheckoutLoyaltyBanner subtotal={DEMO_CART_BELOW} state={state} />
            <CheckoutLoyaltyBanner subtotal={DEMO_CART_ABOVE} state={state} />
          </div>
        </div>
      </section>
    </>
  );
}
