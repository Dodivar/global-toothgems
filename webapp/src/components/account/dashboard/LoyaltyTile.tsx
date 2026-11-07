import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import clsx from "clsx";
import { DashboardTile } from "./DashboardTile";
import { LoyaltyStamp } from "../../loyalty/LoyaltyStamp";
import { useLoyalty } from "../../../lib/loyalty";
import { useLoyaltyCopy } from "../../../lib/loyaltyCopy";
import type { LoyaltyState } from "../../../data/loyalty";

/**
 * The loyalty card, small: the stamps inked so far and what is missing for
 * the reward — or, once it is ready, the reward itself in the dark dress, since
 * it is money waiting to be spent. Read from `lib/loyalty.tsx` (the member's own
 * `loyalty_overview` row); nothing shows until the card has been read, so a
 * member never sees an empty card that is not theirs.
 */
export function LoyaltyTile() {
  const { programme, card, status } = useLoyalty();
  if (!programme.active || status !== "ready" || !card) return null;
  return <LoyaltyTileCard state={card} />;
}

function LoyaltyTileCard({ state }: { state: LoyaltyState }) {
  const { t } = useTranslation();
  const titleId = useId();
  const copy = useLoyaltyCopy(state);
  const ready = state.rewardReady;
  const nextIndex = state.stamps;

  return (
    <DashboardTile
      icon={Sparkles}
      eyebrow={t("loyalty.clubName")}
      to={ready ? "/boutique" : "/compte/fidelite"}
      cta={ready ? copy.cta : t("account.dashboard.loyaltyCta")}
      tone={ready ? "ink" : "paper"}
      labelledBy={titleId}
    >
      <div
        role="img"
        aria-label={t("loyalty.progressAria", { count: state.stamps, total: state.total })}
        className="flex flex-wrap gap-1"
      >
        {Array.from({ length: state.total }, (_, i) => (
          <LoyaltyStamp
            key={i}
            index={i}
            size={34}
            state={i < state.stamps ? "filled" : i === nextIndex ? "next" : "empty"}
            className={clsx(
              i < state.stamps
                ? ready
                  ? "text-[var(--accent-cta)]"
                  : "text-[var(--gt-blue-700)]"
                : ready
                  ? "text-white/40"
                  : "text-[var(--gt-ink-300)]",
            )}
          />
        ))}
      </div>
      <h3
        id={titleId}
        className={clsx("m-0 text-[length:var(--text-h4)]", ready ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]")}
      >
        {copy.title}
      </h3>
      <p className={clsx("m-0 text-[length:var(--text-body-sm)]", ready ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]")}>
        {copy.body}
      </p>
    </DashboardTile>
  );
}
