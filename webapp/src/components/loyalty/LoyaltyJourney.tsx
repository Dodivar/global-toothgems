import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { LoyaltyStamp } from "./LoyaltyStamp";
import { RewardSeal } from "./LoyaltyReward";
import { useReveal } from "../../lib/useReveal";
import { REWARD_PERCENT, STAMPS_PER_CARD } from "../../data/loyalty";

/**
 * The collection, one stamp at a time, from an empty card to the reward.
 *
 * Each row reveals as it scrolls in, using the site's existing `useReveal` +
 * `.gt-reveal` pair — which is already stripped out under
 * `prefers-reduced-motion`, so no new motion needs guarding here.
 */

function JourneyRow({ filled, count, sentence }: { filled: number; count: string; sentence: string }) {
  /** The full card is the row that pays off, so its caption carries the reward tone. */
  const complete = filled === STAMPS_PER_CARD;
  const ref = useReveal<HTMLLIElement>({ trigger: 0.95 });

  return (
    <li ref={ref} className="gt-reveal grid justify-items-center gap-3">
      <div aria-hidden="true" className="flex items-center gap-[clamp(6px,2vw,14px)]">
        {Array.from({ length: STAMPS_PER_CARD }, (_, i) => (
          <LoyaltyStamp
            key={i}
            index={i}
            state={i < filled ? "filled" : "empty"}
            className={clsx(
              "h-auto w-[clamp(32px,8vw,52px)]",
              i < filled ? "text-[var(--gt-blue-700)]" : "text-[var(--gt-ink-400)]",
            )}
          />
        ))}
      </div>
      {/* Six identical sentences down the page would be tiring to read and to
          hear, so the caption is the tally and the sentence goes to screen
          readers only — where each row still announces what it shows. */}
      <span
        aria-hidden="true"
        className={clsx(
          "text-[length:var(--text-caption)] font-semibold tabular-nums uppercase tracking-[var(--tracking-wide)]",
          complete ? "text-[var(--accent-cta-ink)]" : "text-[var(--text-muted)]",
        )}
      >
        {count}
      </span>
      <span className="sr-only">{sentence}</span>
      <ChevronDown size={18} aria-hidden="true" className="text-[var(--gt-blue-300)]" />
    </li>
  );
}

export function LoyaltyJourney() {
  const { t } = useTranslation();
  const rewardRef = useReveal<HTMLLIElement>({ trigger: 0.95 });

  return (
    <ol className="m-0 grid list-none gap-5 p-0">
      {Array.from({ length: STAMPS_PER_CARD + 1 }, (_, filled) => (
        <JourneyRow
          key={filled}
          filled={filled}
          count={t("loyalty.progressValue", { done: filled, total: STAMPS_PER_CARD })}
          sentence={t("loyalty.progressAria", { count: filled, total: STAMPS_PER_CARD })}
        />
      ))}
      <li ref={rewardRef} className="gt-reveal grid justify-items-center gap-3">
        <RewardSeal size={96} className="text-[var(--accent-cta-ink)]" />
        <strong className="text-[length:var(--text-h3)] uppercase tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
          {t("loyalty.journeyReward", { percent: REWARD_PERCENT })}
        </strong>
      </li>
    </ol>
  );
}
