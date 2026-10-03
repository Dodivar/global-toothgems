"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "../../lib/navigation";
import { ArrowRight, ArrowUpRight, RotateCw, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { EmptyPanel, SectionHeader } from "../../components/account/SectionHeader";
import { LoyaltyCard } from "../../components/loyalty/LoyaltyCard";
import { LoyaltyReward } from "../../components/loyalty/LoyaltyReward";
import { LoyaltySteps } from "../../components/loyalty/LoyaltySteps";
import { deriveLoyaltyState } from "../../data/loyalty";
import { useLoyalty } from "../../lib/loyalty";
import { useLoyaltyCopy } from "../../lib/loyaltyCopy";
import { useFormat } from "../../lib/format";

/**
 * The member's loyalty card, read from the database.
 *
 * Stamps are written by the database when Stripe confirms the payment of an
 * order of at least the qualifying amount; this page only shows them. The card
 * is read again on arrival, because the member usually lands here from a
 * payment whose stamp may have been awarded after the session was first read.
 */
export function Loyalty() {
  const { formatPrice } = useFormat();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { programme, card, status, reload } = useLoyalty();

  // A card read before this visit may predate a payment: read it again once.
  const refreshed = useRef(false);
  useEffect(() => {
    if (status === "ready" && !refreshed.current) {
      refreshed.current = true;
      reload();
    }
  }, [status, reload]);

  // Without a backend (the smoke tests' mock mode) no card was ever read: an empty one.
  const state =
    card ??
    deriveLoyaltyState({ currentStamps: 0, total: programme.stampsPerCard, rewardsAvailable: 0, cardsRedeemed: 0 });
  const copy = useLoyaltyCopy(state);

  return (
    <>
      <section className="grid gap-5">
        <SectionHeader
          icon={Sparkles}
          eyebrow={t("loyalty.clubName")}
          title={t("loyalty.memberTitle")}
          description={t("loyalty.memberBody", {
            total: programme.stampsPerCard,
            amount: formatPrice(programme.qualifyingAmount),
            percent: programme.rewardPercent,
          })}
        />

        {status === "loading" ? (
          <p role="status" aria-busy="true" className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {t("loyalty.loading")}
          </p>
        ) : status === "error" ? (
          <EmptyPanel
            action={
              <Button variant="outline" size="sm" iconLeft={RotateCw} onClick={reload}>
                {t("loyalty.retry")}
              </Button>
            }
          >
            {t("loyalty.loadError")}
          </EmptyPanel>
        ) : (
          <>
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
                title={t("loyalty.rewardPanelTitle", { percent: programme.rewardPercent })}
                body={t("loyalty.rewardPanelBody", { percent: programme.rewardPercent })}
              />
            )}
          </>
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
    </>
  );
}
