import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "../../lib/navigation";
import { ArrowRight, CalendarClock, Mail, Store } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { GiftCardVisual } from "../promotions/Visuals";
import { useMoney } from "../promotions/PromoBadges";
import { usePromotions } from "../../lib/adminPromotions";
import { useReveal } from "../../lib/useReveal";

const FACTS = [
  { key: "fact1", icon: Mail },
  { key: "fact2", icon: CalendarClock },
  { key: "fact3", icon: Store },
] as const;

/**
 * The gift card as a gift, not a product tile: the card itself, large and
 * lit, and a row of amounts that re-print it. The amounts are the back
 * office's gift card configuration — the same list /carte-cadeau offers — as
 * is the validity, so the two can never disagree. Picking one here only previews it; buying
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
  // Validity is a back-office setting too: read it rather than restate it.
  const validity = config.expiryMonths ? t("promo.config.validFor", { count: config.expiryMonths }) : t("promo.config.noExpiry");

  return (
    <section ref={ref} aria-labelledby="gt-alt-gift-title" className="gt-reveal gt-alt-section w-full bg-[var(--surface-card)]">
      <div className="gt-alt-wide grid grid-cols-[minmax(0,1fr)] items-center gap-12 px-[var(--gt-alt-gutter)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-[clamp(48px,7vw,140px)]">
        <div className="gt-alt-gift-stage relative grid min-h-[clamp(320px,38vw,560px)] place-items-center overflow-hidden rounded-[var(--radius-2xl)] px-6 py-12">
          <div className="gt-alt-giftcard-stage relative w-[min(86%,460px)] -rotate-3 transition-transform duration-[var(--duration-slow)] hover:rotate-0 motion-reduce:rotate-0 motion-reduce:transition-none">
            <GiftCardVisual
              key={amount}
              design={config.defaultDesign}
              amountCents={amount ?? null}
              recipient={t("homeAlt.gift.exampleRecipient")}
              sender={t("homeAlt.gift.exampleSender")}
              message={t("homeAlt.gift.exampleMessage")}
              size="lg"
              label={t("homeAlt.gift.cardAria", { amount: amount != null ? money(amount) : "" })}
            />
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
                {key === "fact2" ? validity : t(`homeAlt.gift.${key}`)}
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
