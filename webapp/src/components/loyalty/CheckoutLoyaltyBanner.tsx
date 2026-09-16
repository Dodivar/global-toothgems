import { useTranslation } from "react-i18next";
import { Check, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { LoyaltyStamp } from "./LoyaltyStamp";
import { RewardSeal } from "./LoyaltyReward";
import { formatPrice } from "../../lib/format";
import { QUALIFYING_AMOUNT, REWARD_PERCENT, STAMPS_PER_CARD, type LoyaltyState } from "../../data/loyalty";

/**
 * How the programme shows up in checkout.
 *
 * Strictly informational. It reads the cart subtotal and a mock loyalty state and
 * renders a sentence; it never touches the totals, never applies a discount and
 * never talks to the order system. The apply button is inert on purpose and says
 * so.
 *
 * The cart already carries a progress bar towards free delivery, so the walk to
 * the qualifying amount is shown as a stamp filling with ink instead — a second
 * near-identical bar on the same screen would read as a bug.
 */

type Variant = "reward" | "below" | "final" | "qualifies";

/** The next stamp, inked from the bottom in proportion to the basket. */
function FillingStamp({ index, pct }: { index: number; pct: number }) {
  return (
    <span className="relative flex-none" style={{ width: 64, height: 64 }}>
      <LoyaltyStamp index={index} state="empty" size={64} className="absolute inset-0 text-[var(--gt-ink-400)]" />
      <span className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}>
        <LoyaltyStamp index={index} state="filled" size={64} className="text-[var(--gt-blue-700)]" />
      </span>
    </span>
  );
}

export function CheckoutLoyaltyBanner({
  subtotal,
  state,
  className,
}: {
  subtotal: number;
  state: LoyaltyState;
  className?: string;
}) {
  const { t } = useTranslation();

  // A ready reward outranks everything: it is worth money on this order. Below
  // the threshold comes next, because nothing else is true yet. Only then does
  // the card's own position matter.
  const variant: Variant = state.rewardReady
    ? "reward"
    : subtotal < QUALIFYING_AMOUNT
      ? "below"
      : state.stamps === STAMPS_PER_CARD - 1
        ? "final"
        : "qualifies";

  const missing = Math.max(0, QUALIFYING_AMOUNT - subtotal);
  const pct = Math.max(0, Math.min(100, (subtotal / QUALIFYING_AMOUNT) * 100));
  const reward = variant === "reward";

  const heading = (
    <span
      className={clsx(
        "flex items-center gap-2 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)]",
        reward ? "text-[var(--accent-cta-ink)]" : "text-[var(--gt-blue-700)]",
      )}
    >
      <Sparkles size={13} aria-hidden="true" />
      {t("loyalty.clubName")}
    </span>
  );

  return (
    <section
      aria-label={t("loyalty.clubName")}
      className={clsx(
        "grid gap-3 rounded-[var(--radius-md)] border p-4",
        reward ? "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)]" : "border-[var(--gt-blue-200)] bg-[var(--surface-card)]",
        className,
      )}
    >
      {heading}

      {variant === "below" && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={QUALIFYING_AMOUNT}
          aria-valuenow={subtotal}
          aria-valuetext={t("loyalty.checkout.belowAria", {
            current: formatPrice(subtotal),
            threshold: formatPrice(QUALIFYING_AMOUNT),
            missing: formatPrice(missing),
          })}
          className="flex items-center gap-4"
        >
          <span aria-hidden="true">
            <FillingStamp index={state.stamps} pct={pct} />
          </span>
          <span aria-hidden="true" className="grid gap-1">
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
              {t("loyalty.checkout.belowTitle", { missing: formatPrice(missing) })}
            </strong>
            <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
              {t("loyalty.checkout.belowCount", {
                current: formatPrice(subtotal),
                threshold: formatPrice(QUALIFYING_AMOUNT),
              })}
            </span>
          </span>
        </div>
      )}

      {variant === "qualifies" && (
        <p className="m-0 flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          <Check size={16} strokeWidth={2.5} aria-hidden="true" className="mt-0.5 flex-none text-[var(--accent-cta-ink)]" />
          {t("loyalty.checkout.qualifies")}
        </p>
      )}

      {variant === "final" && (
        <div className="flex items-center gap-4">
          <LoyaltyStamp index={state.stamps} state="next" size={56} className="text-[var(--accent-highlight)]" />
          <span className="grid gap-1">
            <strong className="text-[length:var(--text-body-sm)] uppercase tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
              {t("loyalty.checkout.finalTitle", { percent: REWARD_PERCENT })}
            </strong>
            <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">
              {t("loyalty.checkout.finalBody")}
            </span>
          </span>
        </div>
      )}

      {reward && (
        <div className="grid gap-3">
          <div className="flex items-center gap-4">
            <RewardSeal size={64} className="text-[var(--accent-cta-ink)]" />
            <span className="grid gap-1">
              <strong className="text-[length:var(--text-body-sm)] uppercase tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
                {t("loyalty.checkout.rewardTitle", { percent: REWARD_PERCENT })}
              </strong>
              <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                {t("loyalty.checkout.rewardBody", { percent: REWARD_PERCENT })}
              </span>
            </span>
          </div>
          {/* Inert by design: applying a discount is a server's job, and no
              loyalty backend exists. The note below says so in as many words. */}
          <Button variant="outline" size="sm" fullWidth disabled>
            {t("loyalty.checkout.apply", { percent: REWARD_PERCENT })}
          </Button>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("loyalty.checkout.applyNote")}</p>
        </div>
      )}
    </section>
  );
}
