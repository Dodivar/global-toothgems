import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { Check, RefreshCcw } from "lucide-react";
import { GemIcon } from "./Gem";
import { formatPrice } from "../../lib/format";
import { STUDIO_PRICE } from "../../data/studio";

/**
 * The Studio's one offer, drawn as a jewellery-box card rather than a SaaS
 * pricing column: a single plan, the price set large, four benefits and the
 * action. `focus` is the subscription page's larger version, where the card is
 * the subject of the screen and the plan reads as selected.
 */
export function StudioPricingCard({
  variant = "landing",
  action,
  className,
}: {
  variant?: "landing" | "focus";
  action?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const benefits = t("studio.pricing.benefits", { returnObjects: true }) as string[];
  const focus = variant === "focus";

  return (
    <div
      className={clsx(
        "gt-studio-price relative grid gap-6 overflow-hidden rounded-[var(--radius-xl)] border border-white/80 bg-[var(--surface-card)] p-[clamp(22px,3vw,36px)] text-[var(--text-body)] shadow-[var(--shadow-glass-heavy)]",
        className,
      )}
    >
      <div aria-hidden="true" className="gt-studio-price-glow pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="grid gap-1">
          <span className="gt-eyebrow text-[var(--gt-blue-700)]">{t("studio.pricing.eyebrow")}</span>
          <strong className="text-[length:var(--text-h4)] text-[var(--text-primary)]">{t("studio.pricing.planName")}</strong>
        </div>
        {focus ? (
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--status-success-bg)] px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--status-success-fg)]">
            <Check size={12} strokeWidth={3} aria-hidden="true" />
            {t("studio.pricing.selected")}
          </span>
        ) : (
          <span aria-hidden="true" className="flex -space-x-2">
            <GemIcon shape="heart" material="gold" size={30} />
            <GemIcon shape="round" material="crystal" size={30} />
            <GemIcon shape="drop" material="emerald" size={30} />
          </span>
        )}
      </div>

      <p className="relative m-0 flex items-baseline gap-2 text-[var(--text-primary)]">
        <span className={clsx("font-[var(--weight-black)] leading-none tracking-[var(--tracking-display)]", focus ? "text-[clamp(64px,9vw,96px)]" : "text-[clamp(52px,6vw,72px)]")}>
          {formatPrice(STUDIO_PRICE.amount, undefined, STUDIO_PRICE.currency)}
        </span>
        <span className="text-[length:var(--text-body-lg)] font-semibold text-[var(--text-muted)]">{t("studio.pricing.perMonth")}</span>
      </p>

      <ul className="relative m-0 grid list-none gap-2.5 p-0">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2.5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
              <Check size={12} strokeWidth={3} />
            </span>
            {benefit}
          </li>
        ))}
      </ul>

      {action && <div className="relative grid gap-3">{action}</div>}

      <p className="relative m-0 flex items-center gap-2 text-[length:var(--text-caption)] font-medium text-[var(--text-muted)]">
        <RefreshCcw size={13} aria-hidden="true" />
        {t("studio.pricing.reassurance")}
      </p>
    </div>
  );
}
