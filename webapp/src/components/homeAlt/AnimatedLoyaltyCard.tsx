import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, Stamp } from "lucide-react";
import { IconButton } from "../ui/IconButton";
import { LoyaltyCard } from "../loyalty/LoyaltyCard";
import { LOYALTY_STATES, STAMPS_PER_CARD, type LoyaltyState } from "../../data/loyalty";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** Time each stamp stays on the card before the next one is pressed. */
const STAMP_INTERVAL_MS = 3000;

/**
 * The card for a given stamp count. Zero reads as "renewed" rather than "start"
 * because the loop only reaches it straight after a completed card.
 */
function stateForStamps(stamps: number): LoyaltyState {
  if (stamps === 0) return LOYALTY_STATES.renewed;
  if (stamps === STAMPS_PER_CARD) return LOYALTY_STATES.unlocked;
  if (stamps === STAMPS_PER_CARD - 1) return LOYALTY_STATES.oneAway;
  return { ...LOYALTY_STATES.collecting, stamps };
}

/**
 * The home page's sample card, filling itself one stamp every three seconds and
 * starting over once the reward is unlocked, so the visitor sees the whole
 * journey without being handed a second call to action next to the programme
 * link.
 *
 * It only runs while the card is on screen, stops while the pointer
 * is over it, and has a pause toggle (WCAG 2.2.2). Readers who asked for less
 * motion get the static "collecting" card, as before.
 */
export function AnimatedLoyaltyCard() {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [stamps, setStamps] = useState(LOYALTY_STATES.collecting.stamps);
  /** Set only by a tick, so the stamp already inked on first paint is not re-pressed. */
  const [pressed, setPressed] = useState(-1);
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const running = !reducedMotion && inView && !hovered && !userPaused;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setStamps((current) => {
        const next = (current + 1) % (STAMPS_PER_CARD + 1);
        setPressed(next - 1);
        return next;
      });
    }, STAMP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [running]);

  const state = reducedMotion ? LOYALTY_STATES.collecting : stateForStamps(stamps);

  return (
    <div
      ref={ref}
      className="relative mx-auto w-full max-w-[560px]"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <div className="gt-alt-loyalty-card">
        <LoyaltyCard state={state} titleAs="h3" pressedIndex={pressed} />
      </div>
      <span aria-hidden="true" className="gt-alt-float gt-glass absolute -right-2 -top-5 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-4 py-2 text-[13px] font-bold text-[var(--gt-ink-900)] sm:-right-6">
        <Stamp size={15} className="text-[var(--gt-blue-700)]" />
        {t("homeAlt.loyalty.chip")}
      </span>
      {!reducedMotion && (
        <IconButton
          icon={userPaused ? Play : Pause}
          label={t(userPaused ? "homeAlt.loyalty.play" : "homeAlt.loyalty.pause")}
          variant="glass"
          size="sm"
          className="absolute -bottom-4 left-4"
          onClick={() => setUserPaused((p) => !p)}
        />
      )}
    </div>
  );
}
