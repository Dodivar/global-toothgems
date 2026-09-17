import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { REACTIONS, REACTION_GLYPH, type ReactionCounts, type ReactionId } from "../../data/community";
import { useCommunity } from "../../lib/community";
import { focusRing } from "./styles";

/**
 * The three community reactions.
 *
 * Toggles, not a like counter: the seeded number is what other artists left,
 * and the visitor's own reaction is added on top rather than written into it.
 * State never lives in the component — a reaction left in a thread has to still
 * be there when the same discussion is met again on the home page.
 *
 * `aria-pressed` carries the state, so "I reacted" is never conveyed by the
 * tint alone.
 */
export function ReactionBar({
  targetId,
  counts,
  size = "md",
  className,
}: {
  targetId: string;
  counts: ReactionCounts;
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useTranslation();
  const { hasReacted, toggleReaction } = useCommunity();

  return (
    <div className={clsx("flex flex-wrap items-center gap-1.5", className)}>
      {REACTIONS.map((reaction: ReactionId) => {
        const active = hasReacted(targetId, reaction);
        const total = (counts[reaction] ?? 0) + (active ? 1 : 0);
        const label = t(`community.reaction.${reaction}`);

        return (
          <button
            key={reaction}
            type="button"
            aria-pressed={active}
            aria-label={t("community.reactWith", { reaction: label, count: total })}
            onClick={() => toggleReaction(targetId, reaction)}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border font-semibold tabular-nums transition-[background-color,border-color,color] duration-[var(--duration-fast)] active:scale-[0.96]",
              size === "sm"
                ? "h-7 px-2.5 text-[length:var(--text-caption)]"
                : "h-8 px-3 text-[length:var(--text-body-sm)]",
              focusRing,
              active
                ? "border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-muted)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]",
            )}
          >
            <span
              aria-hidden="true"
              className={clsx(
                "transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)]",
                active && "scale-110",
              )}
            >
              {REACTION_GLYPH[reaction]}
            </span>
            {total > 0 && <span aria-hidden="true">{total}</span>}
          </button>
        );
      })}
    </div>
  );
}
