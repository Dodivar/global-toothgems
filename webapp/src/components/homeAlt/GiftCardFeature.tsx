import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarClock, Mail, Store } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { GemIcon } from "../studio/Gem";
import { useMoney } from "../promotions/PromoBadges";
import { usePromotions } from "../../lib/adminPromotions";
import { useReveal } from "../../lib/useReveal";
import monogramWhite from "../../assets/monogram-white.png";

const FACTS = [
  { key: "fact1", icon: Mail },
  { key: "fact2", icon: CalendarClock },
  { key: "fact3", icon: Store },
] as const;

/**
 * The gift card as a gift, not a product tile: the card itself, large and
 * lit, and a row of amounts that re-print it. The amounts are the back
 * office's gift card configuration — the same list /carte-cadeau offers — so
 * the two can never disagree. Picking one here only previews it; buying
 * happens on the gift card page.
 */
export function GiftCardFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const money = useMoney();
  const { config } = usePromotions();
  const ref = useReveal<HTMLElement>();
  const amounts = config.amounts.slice(0, 4);
  const [amount, setAmount] = useState<number | undefined>(amounts[1] ?? amounts[0]);

  return (
    <section ref={ref} aria-labelledby="gt-alt-gift-title" className="gt-reveal gt-alt-section w-full bg-[var(--surface-card)]">
      <div className="gt-alt-wide grid grid-cols-[minmax(0,1fr)] items-center gap-12 px-[var(--gt-alt-gutter)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-[clamp(48px,7vw,140px)]">
        <div className="gt-alt-gift-stage relative grid min-h-[clamp(320px,38vw,560px)] place-items-center overflow-hidden rounded-[var(--radius-2xl)] px-6 py-12">
          <span aria-hidden="true" className="gt-alt-giftcard gt-alt-giftcard--back absolute" />
          <div
            role="img"
            aria-label={t("homeAlt.gift.cardAria", { amount: amount != null ? money(amount) : "" })}
            className="gt-alt-giftcard gt-sparkle relative"
          >
            <span className="flex items-start justify-between">
              <img src={monogramWhite} alt="" className="h-[clamp(34px,3.4vw,48px)] w-auto" />
              <span className="text-[clamp(10px,.9vw,12px)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-white/90">
                {t("homeAlt.gift.cardLabel")}
              </span>
            </span>
            <span className="flex items-end justify-between gap-4">
              <span className="grid gap-1">
                <span className="text-[clamp(10px,.9vw,12px)] font-semibold uppercase tracking-[var(--tracking-logo)] text-white/85">Global Toothgems</span>
                <span key={amount} className="gt-alt-amount-in text-[clamp(38px,4.4vw,64px)] font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)] text-white">
                  {amount != null ? money(amount) : ""}
                </span>
              </span>
              <span aria-hidden="true" className="flex -space-x-2">
                <GemIcon shape="heart" material="rose" size={30} />
                <GemIcon shape="round" material="crystal" size={30} />
                <GemIcon shape="star" material="gold" size={30} />
              </span>
            </span>
          </div>
        </div>

        <div className="grid justify-items-start gap-6">
          <Badge tone="highlight">{t("homeAlt.gift.badge")}</Badge>
          <h2 id="gt-alt-gift-title" className="gt-alt-h2 max-w-[15ch]">{t("homeAlt.gift.title")}</h2>
          <p className="m-0 max-w-[50ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("homeAlt.gift.body")}</p>

          {amounts.length > 0 && (
            <div className="grid gap-3">
              <span id="gt-alt-gift-amounts" className="gt-eyebrow">{t("homeAlt.gift.amountsLabel")}</span>
              <div role="group" aria-labelledby="gt-alt-gift-amounts" className="flex flex-wrap gap-2">
                {amounts.map((a) => (
                  <button
                    key={a}
                    type="button"
                    aria-pressed={a === amount}
                    onClick={() => setAmount(a)}
                    className={clsx(
                      "h-11 min-w-[76px] rounded-[var(--radius-pill)] border px-5 text-[14px] font-bold transition-[background-color,border-color,color] duration-[var(--duration-fast)]",
                      a === amount
                        ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-900)] text-[var(--gt-off-white)]"
                        : "border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:border-[var(--gt-ink-900)]",
                    )}
                  >
                    {money(a)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
            {FACTS.map(({ key, icon: Icon }) => (
              <li key={key} className="inline-flex items-center gap-2 text-[length:var(--text-body-sm)] font-medium text-[var(--text-body)]">
                <Icon size={16} aria-hidden="true" className="text-[var(--gt-blue-600)]" />
                {t(`homeAlt.gift.${key}`)}
              </li>
            ))}
          </ul>

          <Button variant="dark" size="lg" iconRight={ArrowRight} className="max-sm:!h-auto max-sm:min-h-14 max-sm:py-3 max-sm:!whitespace-normal max-sm:text-center" onClick={() => navigate("/carte-cadeau")}>
            {t("homeAlt.gift.cta")}
          </Button>
        </div>
      </div>
    </section>
  );
}
