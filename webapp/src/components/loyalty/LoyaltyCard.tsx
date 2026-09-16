import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { LoyaltyStamp } from "./LoyaltyStamp";
import { LoyaltyProgress } from "./LoyaltyProgress";
import { useLoyaltyCopy } from "../../lib/loyaltyCopy";
import { formatPrice } from "../../lib/format";
import { QUALIFYING_AMOUNT, STAMPS_PER_CARD, type LoyaltyState } from "../../data/loyalty";
import monogramBlue from "../../assets/monogram-blue.png";
import monogramWhite from "../../assets/monogram-white.png";

/**
 * The digital loyalty card: the centrepiece of the programme.
 *
 * It is a physical object first — laid paper, a perforation, ink impressions —
 * and a dashboard widget second. Four of the five states share that paper
 * treatment; a completed card flips to the inverse ink treatment, which is what
 * makes reaching five feel like an event rather than a fifth identical row.
 *
 * Presentational only. It receives a state and renders it; it never computes,
 * stores or redeems anything.
 */

interface LoyaltyCardProps {
  state: LoyaltyState;
  /** The page supplies its own call to action, or none at all for a preview. */
  action?: ReactNode;
  /** The card sits under a different heading on each page, so the level is the page's call. */
  titleAs?: "h2" | "h3";
  /** Smaller type and stamps, for the side-by-side state gallery. */
  compact?: boolean;
  className?: string;
}

const DASH_INK = "repeating-linear-gradient(90deg, rgba(255,255,255,.3) 0 4px, transparent 4px 11px)";
const DASH_PAPER = "repeating-linear-gradient(90deg, rgba(63,90,117,.4) 0 4px, transparent 4px 11px)";

const STOCK_INK = "radial-gradient(120% 90% at 85% 0%, rgba(62,219,160,.22), transparent 58%)";
const STOCK_PAPER =
  "repeating-linear-gradient(135deg, rgba(63,90,117,.05) 0 1px, transparent 1px 7px), radial-gradient(110% 80% at 88% 0%, rgba(185,205,229,.4), transparent 60%)";

export function LoyaltyCard({ state, action, titleAs = "h2", compact = false, className }: LoyaltyCardProps) {
  const { t } = useTranslation();
  const copy = useLoyaltyCopy(state);
  const complete = state.rewardReady;
  const Title = titleAs;

  /** Only the card that is one purchase from complete singles out its next slot. */
  const nextIndex = state.id === "oneAway" ? state.stamps : -1;

  const stampTone = (index: number) => {
    if (index < state.stamps) return complete ? "text-[var(--accent-cta)]" : "text-[var(--gt-blue-700)]";
    if (index === nextIndex) return "text-[var(--accent-highlight)]";
    // Empty slots stay quieter than inked ones, but not so quiet they vanish
    // into near-white card stock — ink-300 was invisible at card size.
    return complete ? "text-white/30" : "text-[var(--gt-ink-400)]";
  };

  return (
    <article
      className={clsx(
        "relative overflow-hidden rounded-[var(--radius-xl)] border shadow-[var(--shadow-lg)] transition-colors duration-[var(--duration-slow)]",
        compact ? "p-[clamp(16px,2.5vw,24px)]" : "p-[clamp(20px,3vw,34px)]",
        complete
          ? "border-transparent bg-[var(--surface-inverse)]"
          : "border-[var(--gt-blue-200)] bg-[linear-gradient(160deg,var(--gt-white)_0%,var(--gt-off-white)_45%,var(--gt-sand)_100%)]",
        className,
      )}
    >
      {/* Card stock: fine ruling plus a corner bloom. Decorative, never read. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: complete ? STOCK_INK : STOCK_PAPER }}
      />

      <div className={clsx("relative grid", compact ? "gap-4" : "gap-[clamp(18px,2.6vw,26px)]")}>
        {/* Wraps rather than squeezes: at 375px the badge would otherwise break
            "Global Toothgems" and "Loyalty Club" across four lines. */}
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <img
              src={complete ? monogramWhite : monogramBlue}
              alt=""
              loading="lazy"
              decoding="async"
              className={clsx("w-auto flex-none", compact ? "h-7" : "h-9")}
            />
            <div className="grid gap-0.5">
              <span
                className={clsx(
                  "whitespace-nowrap text-[length:var(--text-eyebrow)] font-semibold uppercase leading-none tracking-[var(--tracking-eyebrow)]",
                  complete ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]",
                )}
              >
                {t("loyalty.brand")}
              </span>
              <strong
                className={clsx(
                  "whitespace-nowrap font-[var(--weight-black)] uppercase leading-none tracking-[var(--tracking-wide)]",
                  compact ? "text-[length:var(--text-body-sm)]" : "text-[length:var(--text-h4)]",
                  complete ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]",
                )}
              >
                {t("loyalty.clubName")}
              </strong>
            </div>
          </div>

          <span
            className={clsx(
              "flex-none rounded-[var(--radius-pill)] border px-3 py-1 text-[10px] font-semibold uppercase tracking-[var(--tracking-wide)]",
              complete
                ? "border-[var(--gt-emerald-400)] bg-[var(--accent-cta)] text-[var(--text-on-accent)]"
                : state.id === "oneAway"
                  ? "border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]"
                  : "border-[var(--gt-blue-200)] bg-[var(--gt-blue-50)] text-[var(--gt-blue-700)]",
            )}
          >
            {copy.badge}
          </span>
        </header>

        {/* Perforation. The two notches are clipped in half by the card's own
            overflow, which is what sells the tear-off edge. */}
        <div
          aria-hidden="true"
          className={clsx("relative h-px", compact ? "-mx-[clamp(16px,2.5vw,24px)]" : "-mx-[clamp(20px,3vw,34px)]")}
        >
          <span className="absolute inset-x-6 top-0 h-px" style={{ backgroundImage: complete ? DASH_INK : DASH_PAPER }} />
          <span className="absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[var(--surface-page)]" />
          <span className="absolute -right-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-[var(--surface-page)]" />
        </div>

        {/* The stamps carry no text of their own: the progressbar below states the
            count, so labelling them here would double every announcement. */}
        <div
          aria-hidden="true"
          className={clsx("flex items-center justify-between", compact ? "gap-1.5" : "gap-[clamp(6px,2vw,18px)]")}
        >
          {Array.from({ length: STAMPS_PER_CARD }, (_, i) => (
            <LoyaltyStamp
              key={i}
              index={i}
              state={i < state.stamps ? "filled" : i === nextIndex ? "next" : "empty"}
              className={clsx(
                "h-auto",
                compact ? "w-[clamp(34px,7vw,44px)]" : "w-[clamp(44px,11vw,72px)]",
                stampTone(i),
              )}
            />
          ))}
        </div>

        <LoyaltyProgress stamps={state.stamps} total={STAMPS_PER_CARD} tone={complete ? "ink" : "paper"} />

        <div className="grid gap-2">
          {/* The one decorative-script moment in the programme, saved for the
              payoff — the role it already plays on the order-confirmed screen. */}
          {complete && (
            <span aria-hidden="true" className="gt-script text-[clamp(30px,5vw,44px)] leading-none text-[var(--gt-emerald-300)]">
              {t("loyalty.state.unlocked.script")}
            </span>
          )}
          <Title
            className={clsx(
              "uppercase tracking-[var(--tracking-tight)]",
              compact ? "text-[length:var(--text-h4)]" : "text-[length:var(--text-h3)]",
              complete ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]",
            )}
          >
            {copy.title}
          </Title>
          <p
            className={clsx(
              "m-0 max-w-[46ch] text-[length:var(--text-body-sm)]",
              complete ? "text-[var(--gt-ink-300)]" : "text-[var(--text-body)]",
            )}
          >
            {copy.body}
          </p>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-4">
          <span
            className={clsx(
              "text-[length:var(--text-caption)]",
              complete ? "text-[var(--gt-ink-400)]" : "text-[var(--text-muted)]",
            )}
          >
            {t("loyalty.minimumNote", { amount: formatPrice(QUALIFYING_AMOUNT) })}
          </span>
          {action}
        </footer>
      </div>
    </article>
  );
}
