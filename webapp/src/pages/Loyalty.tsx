import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "../components/ui/Button";
import { LoyaltyCard } from "../components/loyalty/LoyaltyCard";
import { LoyaltySteps } from "../components/loyalty/LoyaltySteps";
import { LoyaltyJourney } from "../components/loyalty/LoyaltyJourney";
import { LoyaltyFAQ } from "../components/loyalty/LoyaltyFAQ";
import { useReveal } from "../lib/useReveal";
import { photo } from "../lib/images";
import { formatPrice } from "../lib/format";
import {
  LOYALTY_STATES,
  LOYALTY_STATE_ORDER,
  QUALIFYING_AMOUNT,
  REWARD_PERCENT,
  STAMPS_PER_CARD,
} from "../data/loyalty";

/**
 * The public page for the Loyalty Club: what it is, how it works, what a full
 * card is worth.
 *
 * Open to everyone, like the Academy landing page — it is the sales page for the
 * programme, and gating it would hide the thing it is meant to advertise. Every
 * card on it is static mock data.
 */
export function Loyalty() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const stepsRef = useReveal<HTMLDivElement>();
  const journeyRef = useReveal<HTMLDivElement>();
  const statesRef = useReveal<HTMLDivElement>();
  const faqRef = useReveal<HTMLDivElement>();

  return (
    <div>
      {/* Hero */}
      <section className="relative grid items-end overflow-hidden bg-[var(--surface-brand)] px-[clamp(14px,4vw,48px)] pb-[clamp(40px,6vw,72px)] pt-[clamp(56px,8vw,96px)]">
        <div className="absolute inset-0 overflow-hidden border-b border-[var(--gt-blue-500)]">
          <img
            src={photo("mouth-05.jpg")}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="block h-full w-full object-cover"
            style={{ objectPosition: "50% 42%" }}
          />
        </div>

        <div className="relative mx-auto grid w-full min-w-0 max-w-[var(--max-width-content)] grid-cols-1 items-center gap-[clamp(24px,4vw,48px)] lg:grid-cols-[minmax(0,1fr)_minmax(min(440px,100%),0.85fr)]">
          <div className="gt-glass-panel grid min-w-0 gap-5 rounded-[var(--radius-xl)] p-[clamp(24px,3vw,40px)]">
            <span className="gt-script text-[clamp(26px,3.4vw,40px)] text-[var(--gt-blue-700)]">
              {t("loyalty.heroScript")}
            </span>
            <h1 className="text-[length:var(--text-display-2)] font-[var(--weight-black)] uppercase leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-ink-900)]">
              {t("loyalty.heroTitle")}
            </h1>
            <p className="m-0 max-w-[48ch] text-[length:var(--text-body-lg)] text-[var(--gt-ink-900)]">
              {t("loyalty.heroBody", {
                total: STAMPS_PER_CARD,
                amount: formatPrice(QUALIFYING_AMOUNT),
                percent: REWARD_PERCENT,
              })}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => navigate("/boutique")}>
                {t("loyalty.heroCta")}
              </Button>
              <Button variant="dark" size="lg" iconLeft={Sparkles} onClick={() => navigate("/compte/fidelite")}>
                {t("loyalty.heroCtaSecondary")}
              </Button>
            </div>
          </div>

          <LoyaltyCard state={LOYALTY_STATES.collecting} titleAs="h2" className="justify-self-stretch" />
        </div>
      </section>

      {/* How it works */}
      <section ref={stepsRef} aria-labelledby="gt-loyalty-how" className="gt-reveal px-[clamp(14px,4vw,48px)] pt-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <div className="grid max-w-[620px] gap-2.5">
            <span className="gt-eyebrow">{t("loyalty.howEyebrow")}</span>
            <h2 id="gt-loyalty-how" className="text-[length:var(--text-h2)] tracking-[var(--tracking-display)]">
              {t("loyalty.howTitle")}
            </h2>
          </div>
          <LoyaltySteps />
        </div>
      </section>

      {/* The collection, stamp by stamp */}
      <section ref={journeyRef} aria-labelledby="gt-loyalty-journey" className="gt-reveal px-[clamp(14px,4vw,48px)] pt-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-10">
          <div className="grid max-w-[620px] gap-2.5">
            <span className="gt-eyebrow">{t("loyalty.journeyEyebrow")}</span>
            <h2 id="gt-loyalty-journey" className="text-[length:var(--text-h2)] tracking-[var(--tracking-display)]">
              {t("loyalty.journeyTitle")}
            </h2>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">
              {t("loyalty.journeyBody")}
            </p>
          </div>
          <LoyaltyJourney />
        </div>
      </section>

      {/* Every state of the card */}
      <section ref={statesRef} aria-labelledby="gt-loyalty-states" className="gt-reveal px-[clamp(14px,4vw,48px)] pt-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <div className="grid max-w-[620px] gap-2.5">
            <span className="gt-eyebrow">{t("loyalty.statesEyebrow")}</span>
            <h2 id="gt-loyalty-states" className="text-[length:var(--text-h2)] tracking-[var(--tracking-display)]">
              {t("loyalty.statesTitle")}
            </h2>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-md)] text-[var(--text-body)]">
              {t("loyalty.statesBody")}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {LOYALTY_STATE_ORDER.map((id) => (
              <LoyaltyCard key={id} state={LOYALTY_STATES[id]} titleAs="h3" compact />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section ref={faqRef} aria-labelledby="gt-loyalty-faq" className="gt-reveal px-[clamp(14px,4vw,48px)] py-[var(--section-y)]">
        <div className="mx-auto grid max-w-[var(--max-width-content)] gap-8">
          <div className="grid max-w-[620px] gap-2.5">
            <span className="gt-eyebrow">{t("loyalty.faqEyebrow")}</span>
            <h2 id="gt-loyalty-faq" className="text-[length:var(--text-h2)] tracking-[var(--tracking-display)]">
              {t("loyalty.faqTitle")}
            </h2>
          </div>
          <LoyaltyFAQ />
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-[clamp(14px,4vw,48px)] pb-[var(--section-y)]">
        <div className="mx-auto flex max-w-[var(--max-width-content)] flex-wrap items-center justify-between gap-6 rounded-[var(--radius-xl)] bg-[var(--surface-inverse)] p-[clamp(24px,4vw,48px)]">
          <div className="grid max-w-[520px] gap-2">
            <h2 className="text-[length:var(--text-h2)] uppercase tracking-[var(--tracking-display)] text-[var(--gt-off-white)]">
              {t("loyalty.closingTitle")}
            </h2>
            <p className="m-0 text-[length:var(--text-body-md)] text-[var(--gt-ink-300)]">
              {t("loyalty.closingBody", { amount: formatPrice(QUALIFYING_AMOUNT) })}
            </p>
          </div>
          <Button variant="primary" size="lg" iconRight={ArrowRight} onClick={() => navigate("/boutique")}>
            {t("loyalty.heroCta")}
          </Button>
        </div>
      </section>
    </div>
  );
}
