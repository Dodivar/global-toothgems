import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { REWARD_PERCENT } from "../../data/loyalty";

/**
 * The reward itself: a foil seal, what it is worth, and what to do with it.
 *
 * Shown on the member page once a card is complete, and reused inside the
 * checkout banner so the reward looks the same wherever it turns up. Like every
 * other piece of this prototype it only displays — no discount exists behind it.
 */

/**
 * Scalloped edge of the seal, generated once rather than hand-drawn: a foil
 * sticker is a circle crimped at regular intervals, which is exactly a polygon
 * alternating between two radii.
 */
function scallopPath(teeth = 30, outer = 31, inner = 27.4, cx = 32, cy = 32) {
  const step = Math.PI / teeth;
  let d = "";
  for (let i = 0; i < teeth * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = i * step - Math.PI / 2;
    d += `${i === 0 ? "M" : "L"}${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }
  return `${d}Z`;
}

const SCALLOP = scallopPath();

export function RewardSeal({ size = 88, className }: { size?: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label={t("loyalty.sealAria", { percent: REWARD_PERCENT })}
      className={clsx("flex-none", className)}
    >
      <path d={SCALLOP} fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      <circle cx={32} cy={32} r={23.5} stroke="currentColor" strokeWidth={1} strokeOpacity={0.55} />
      <text
        x={32}
        y={31}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="currentColor"
        fontFamily="var(--font-display)"
        fontSize={19}
        fontWeight={800}
        letterSpacing="-0.5"
      >
        {REWARD_PERCENT}%
      </text>
      <text
        x={32}
        y={44}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="currentColor"
        fontFamily="var(--font-display)"
        fontSize={7.5}
        fontWeight={700}
        letterSpacing="1.6"
      >
        {t("loyalty.sealOff")}
      </text>
    </svg>
  );
}

export function LoyaltyReward({
  title,
  body,
  action,
  tone = "paper",
  className,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  tone?: "paper" | "ink";
  className?: string;
}) {
  const { t } = useTranslation();
  const ink = tone === "ink";

  return (
    <section
      className={clsx(
        "grid items-center gap-5 rounded-[var(--radius-card)] border p-[var(--space-5)] sm:grid-cols-[auto_minmax(0,1fr)]",
        ink
          ? "border-transparent bg-[var(--surface-inverse)] text-[var(--gt-ink-300)]"
          : "border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] text-[var(--text-body)]",
        className,
      )}
    >
      <RewardSeal className={ink ? "text-[var(--accent-cta)]" : "text-[var(--accent-cta-ink)]"} />
      <div className="grid gap-2">
        <h3
          className={clsx(
            "text-[length:var(--text-h4)] uppercase tracking-[var(--tracking-tight)]",
            ink ? "text-[var(--gt-off-white)]" : "text-[var(--text-primary)]",
          )}
        >
          {title}
        </h3>
        <p className="m-0 text-[length:var(--text-body-sm)]">{body}</p>
        {action}
        <p className={clsx("m-0 text-[length:var(--text-caption)]", ink ? "text-[var(--gt-ink-400)]" : "text-[var(--text-muted)]")}>
          {t("loyalty.demoNote")}
        </p>
      </div>
    </section>
  );
}
