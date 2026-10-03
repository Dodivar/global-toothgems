import { useTranslation } from "react-i18next";
import { Check, Sparkles } from "lucide-react";
import clsx from "clsx";
import { LoyaltyStamp } from "./LoyaltyStamp";
import { RewardSeal } from "./LoyaltyReward";
import { useFormat } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import { Link } from "../../lib/navigation";
import { useLoyalty } from "../../lib/loyalty";

/**
 * How the programme shows up in checkout.
 *
 * Strictly informational. It reads the basket's qualifying subtotal and the
 * member's real card and renders a sentence; it never touches the totals and
 * never talks to the order system. The stamp itself is awarded by the database
 * when the payment is confirmed. For a completed card it also offers to spend the
 * reward: that is only a request, the database computes the discount.
 *
 * The cart already carries a progress bar towards free delivery, so the walk to
 * the qualifying amount is shown as a stamp filling with ink instead — a second
 * near-identical bar on the same screen would read as a bug.
 */

type Variant = "guest" | "reward" | "below" | "final" | "qualifies";

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
  reward: spending,
  className,
}: {
  /** Value of the shop goods in the basket, major units. */
  subtotal: number;
  /** Spending the completed card on this order: the choice, its estimated saving, and where it is changed. */
  reward: { checked: boolean; saving: number; onChange: (checked: boolean) => void; disabled?: boolean };
  className?: string;
}) {
  const { formatPrice } = useFormat();
  const { t } = useTranslation();
  const { signedIn } = useAuth();
  const { programme, card } = useLoyalty();
  const threshold = programme.qualifyingAmount;
  const percent = programme.rewardPercent;

  // Nothing to say while the programme is off, or until the member's card has
  // been read: a banner that flips from "start" to the real card would mislead.
  if (!programme.active || (signedIn && !card)) return null;
  const stamps = card?.stamps ?? 0;

  // A ready reward outranks everything: it is worth money on this order. Below
  // the threshold comes next, because nothing else is true yet. Only then does
  // the card's own position matter.
  const variant: Variant = card?.rewardReady
    ? "reward"
    : subtotal < threshold
      ? "below"
      : !signedIn
        ? "guest"
        : stamps === programme.stampsPerCard - 1
          ? "final"
          : "qualifies";

  const missing = Math.max(0, threshold - subtotal);
  const pct = Math.max(0, Math.min(100, (subtotal / threshold) * 100));
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
          aria-valuemax={threshold}
          aria-valuenow={subtotal}
          aria-valuetext={t("loyalty.checkout.belowAria", {
            current: formatPrice(subtotal),
            threshold: formatPrice(threshold),
            missing: formatPrice(missing),
          })}
          className="flex items-center gap-4"
        >
          <span aria-hidden="true">
            <FillingStamp index={stamps} pct={pct} />
          </span>
          <span aria-hidden="true" className="grid gap-1">
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
              {t("loyalty.checkout.belowTitle", { missing: formatPrice(missing) })}
            </strong>
            <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
              {t("loyalty.checkout.belowCount", {
                current: formatPrice(subtotal),
                threshold: formatPrice(threshold),
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

      {variant === "guest" && (
        <p className="m-0 flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
          <Sparkles size={16} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
          <span>
            {t("loyalty.checkout.guest")}{" "}
            <Link
              to="/connexion"
              className="font-semibold text-[var(--text-primary)] underline decoration-1 underline-offset-4"
            >
              {t("loyalty.checkout.guestLink")}
            </Link>
          </span>
        </p>
      )}

      {variant === "final" && (
        <div className="flex items-center gap-4">
          <LoyaltyStamp index={stamps} state="next" size={56} className="text-[var(--accent-highlight)]" />
          <span className="grid gap-1">
            <strong className="text-[length:var(--text-body-sm)] uppercase tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
              {t("loyalty.checkout.finalTitle", { percent })}
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
                {t("loyalty.checkout.rewardTitle", { percent })}
              </strong>
              <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                {t("loyalty.checkout.rewardBody", { percent })}
              </span>
            </span>
          </div>
          {subtotal > 0 ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={spending.checked}
                  disabled={spending.disabled}
                  onChange={(event) => spending.onChange(event.target.checked)}
                  className="h-4 w-4 flex-none accent-[var(--accent-cta-ink)]"
                />
                {t("loyalty.checkout.use", { percent })}
              </label>
              {spending.checked && (
                <p role="status" className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("loyalty.checkout.saving", { amount: formatPrice(spending.saving) })}
                </p>
              )}
            </>
          ) : (
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("loyalty.checkout.needsGoods")}</p>
          )}
        </div>
      )}
    </section>
  );
}
