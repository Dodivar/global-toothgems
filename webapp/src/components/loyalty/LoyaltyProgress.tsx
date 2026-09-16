import { useTranslation } from "react-i18next";
import clsx from "clsx";

/**
 * The card's progress, as a figure and a segmented rail.
 *
 * A single filling bar was deliberately avoided: stamps are collected one by one,
 * so the rail is cut into the same number of segments as the card has positions.
 * The whole block is one `progressbar` carrying the sentence a screen reader
 * should hear — "3 of 5 loyalty stamps collected." — while the pieces inside it
 * stay decorative, so the count is never announced twice.
 */
export function LoyaltyProgress({
  stamps,
  total,
  tone = "paper",
  className,
}: {
  stamps: number;
  total: number;
  tone?: "paper" | "ink";
  className?: string;
}) {
  const { t } = useTranslation();
  const ink = tone === "ink";

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={stamps}
      aria-valuetext={t("loyalty.progressAria", { count: stamps, total })}
      className={clsx("grid gap-2.5", className)}
    >
      <div aria-hidden="true" className="flex items-baseline gap-2">
        <strong
          className={clsx(
            "text-[clamp(26px,4vw,34px)] font-[var(--weight-black)] leading-none tabular-nums",
            ink ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]",
          )}
        >
          {t("loyalty.progressValue", { done: stamps, total })}
        </strong>
        <span
          className={clsx(
            "text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)]",
            ink ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]",
          )}
        >
          {t("loyalty.progressUnit")}
        </span>
      </div>

      <div aria-hidden="true" className="flex gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={clsx(
              "h-1 flex-1 rounded-[var(--radius-pill)] transition-colors duration-[var(--duration-normal)]",
              i < stamps
                ? ink
                  ? "bg-[var(--accent-cta)]"
                  : "bg-[var(--gt-blue-700)]"
                : ink
                  ? "bg-white/20"
                  : "bg-[var(--gt-ink-200)]",
            )}
          />
        ))}
      </div>
    </div>
  );
}
