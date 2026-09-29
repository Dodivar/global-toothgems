import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BadgePercent, Stamp, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { AnimatedLoyaltyCard } from "./AnimatedLoyaltyCard";
import { QUALIFYING_AMOUNT, REWARD_PERCENT, STAMPS_PER_CARD } from "../../data/loyalty";
import { formatPrice } from "../../lib/format";
import { useReveal } from "../../lib/useReveal";

/**
 * The Loyalty Club in one band on the brand blue: the promise, the three
 * numbers that make the programme, and a sample card. Every figure comes from
 * `data/loyalty`, so the band cannot drift from the programme page. The card
 * is a self-filling sample, not the visitor's own progress.
 */
export function LoyaltyFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useReveal<HTMLElement>();
  const amount = formatPrice(QUALIFYING_AMOUNT);

  const perks = [
    { icon: Stamp, value: t("homeAlt.loyalty.perk1Value"), label: t("homeAlt.loyalty.perk1Label", { amount }) },
    { icon: Sparkles, value: t("homeAlt.loyalty.perk2Value", { total: STAMPS_PER_CARD }), label: t("homeAlt.loyalty.perk2Label") },
    { icon: BadgePercent, value: t("homeAlt.loyalty.perk3Value", { percent: REWARD_PERCENT }), label: t("homeAlt.loyalty.perk3Label") },
  ];

  return (
    <section ref={ref} aria-labelledby="gt-alt-loyalty-title" className="gt-reveal gt-alt-loyalty relative w-full overflow-hidden">
      <div className="gt-alt-wide grid grid-cols-[minmax(0,1fr)] items-center gap-12 px-[var(--gt-alt-gutter)] py-[clamp(64px,8vw,120px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-[clamp(48px,6vw,120px)]">
        <div className="grid justify-items-start gap-6">
          <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("homeAlt.loyalty.eyebrow")}</span>
          <h2 id="gt-alt-loyalty-title" className="gt-alt-display max-w-[12ch]">{t("homeAlt.loyalty.title")}</h2>
          <p className="m-0 max-w-[52ch] text-[length:var(--text-body-lg)] text-[var(--gt-ink-800)]">
            {t("homeAlt.loyalty.body", { amount, percent: REWARD_PERCENT })}
          </p>
          <ul className="m-0 grid w-full list-none gap-3 p-0 sm:grid-cols-3">
            {perks.map(({ icon: Icon, value, label }) => (
              <li key={value} className="grid gap-1 rounded-[var(--radius-lg)] bg-white/55 p-4 ring-1 ring-white/70 backdrop-blur-sm">
                <Icon size={18} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
                <strong className="text-[22px] font-[var(--weight-black)] leading-tight text-[var(--gt-ink-900)]">{value}</strong>
                <span className="text-[13px] text-[var(--gt-ink-700)]">{label}</span>
              </li>
            ))}
          </ul>
          <Button variant="dark" size="lg" iconRight={ArrowRight} className="max-sm:!h-auto max-sm:min-h-14 max-sm:py-3 max-sm:!whitespace-normal max-sm:text-center" onClick={() => navigate("/fidelite")}>
            {t("homeAlt.loyalty.cta")}
          </Button>
        </div>

        <AnimatedLoyaltyCard />
      </div>
    </section>
  );
}
