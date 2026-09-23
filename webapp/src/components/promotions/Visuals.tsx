import { useTranslation } from "react-i18next";
import clsx from "clsx";
import monogramWhite from "../../assets/monogram-white.png";
import monogramBlue from "../../assets/monogram-blue.png";
import { photo } from "../../lib/images";
import type { CampaignTheme, GiftCardDesign } from "../../data/adminPromotions";
import { useMoney } from "./PromoBadges";

/**
 * The two brand visuals of the workspace: the gift card itself and a campaign
 * banner. Both are drawn in CSS (see `.gt-giftcard` and `.gt-campaign-cover` in
 * `index.css`) rather than shipped as images, so an amount, a name or a theme
 * typed in a form re-renders the artwork immediately — the whole point of a
 * live preview.
 *
 * They are shared by the back office and the storefront on purpose: what the
 * administrator previews is, pixel for pixel, what the customer receives.
 */

const DARK_DESIGNS: GiftCardDesign[] = ["noir", "photo"];

function Sparkles({ className }: { className?: string }) {
  // Four-point stars: the brand's "strass" glint, drawn rather than imported.
  const star = "M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z";
  return (
    <svg aria-hidden="true" viewBox="0 0 200 120" className={clsx("pointer-events-none absolute inset-0 h-full w-full", className)}>
      {/* The twinkle animates `transform`, which would override an SVG
          transform attribute — so each star is positioned by its group and
          animated on the path inside it. */}
      <g fill="currentColor">
        <g transform="translate(150 14) scale(.9)" opacity=".9">
          <path d={star} className="gt-sys-twinkle" />
        </g>
        <g transform="translate(176 44) scale(.45)" opacity=".7">
          <path d={star} className="gt-sys-twinkle" style={{ ["--gt-delay" as string]: "600ms" }} />
        </g>
        <g transform="translate(128 50) scale(.35)" opacity=".6">
          <path d={star} className="gt-sys-twinkle" style={{ ["--gt-delay" as string]: "1200ms" }} />
        </g>
      </g>
    </svg>
  );
}

export function GiftCardVisual({
  design,
  amountCents,
  recipient,
  sender,
  message,
  code,
  size = "md",
  className,
  label,
}: {
  design: GiftCardDesign;
  amountCents: number | null;
  recipient?: string;
  sender?: string;
  message?: string;
  code?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Accessible description; defaults to a sentence built from the props. */
  label?: string;
}) {
  const { t } = useTranslation();
  const money = useMoney();
  const dark = DARK_DESIGNS.includes(design);
  const amount = amountCents != null && amountCents > 0 ? money(amountCents) : "—";

  const description =
    label ??
    t("promo.visual.cardAlt", {
      design: t(`promo.design.${design}`),
      amount,
    });

  return (
    <figure
      // An empty label marks a decorative thumbnail sitting beside its own text.
      role={label === "" ? undefined : "img"}
      aria-label={label === "" ? undefined : description}
      aria-hidden={label === "" ? true : undefined}
      data-design={design}
      className={clsx(
        "gt-giftcard gt-sparkle relative m-0 aspect-[1.586/1] w-full overflow-hidden",
        size === "sm" ? "rounded-[12px]" : "rounded-[var(--radius-lg)]",
        className,
      )}
    >
      {design === "photo" && (
        <>
          <img src={photo("mouth-01.jpg")} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(120deg,rgba(17,17,17,.72),rgba(17,17,17,.2)_70%)]" />
        </>
      )}
      <Sparkles className={dark ? "text-[var(--gt-white)]" : "text-[var(--gt-white)]"} />

      <div
        aria-hidden="true"
        className={clsx(
          "relative flex h-full flex-col justify-between",
          size === "sm" ? "p-3" : size === "lg" ? "p-[clamp(18px,4.5%,30px)]" : "p-[clamp(14px,5%,24px)]",
          dark ? "text-[var(--gt-off-white)]" : "text-[var(--gt-ink-900)]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-2">
            <img src={dark ? monogramWhite : monogramBlue} alt="" className={size === "sm" ? "h-4 w-auto" : "h-6 w-auto"} />
            {size !== "sm" && (
              <span className="text-[10px] font-bold uppercase tracking-[var(--tracking-logo)]">Global Toothgems</span>
            )}
          </span>
          <span
            className={clsx(
              "gt-script leading-none",
              size === "sm" ? "text-[18px]" : size === "lg" ? "text-[clamp(28px,5vw,40px)]" : "text-[clamp(22px,4vw,30px)]",
            )}
          >
            {t("promo.visual.giftCard")}
          </span>
        </div>

        {message && size !== "sm" && (
          <p
            className={clsx(
              "m-0 line-clamp-2 max-w-[80%] self-start rounded-[10px] px-2.5 py-1.5 text-[clamp(10px,1.6vw,12px)] italic leading-snug",
              dark ? "bg-[rgba(17,17,17,.35)] text-[var(--gt-off-white)]" : "gt-glass text-[var(--gt-ink-800)]",
            )}
          >
            “{message}”
          </p>
        )}

        <div className="flex items-end justify-between gap-3">
          <div className="grid min-w-0 gap-0.5">
            {recipient && size !== "sm" && (
              <span className="truncate text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] opacity-80">
                {t("promo.visual.for", { name: recipient })}
              </span>
            )}
            <span
              className={clsx(
                "font-bold leading-none tracking-[var(--tracking-display)] tabular-nums",
                size === "sm" ? "text-[20px]" : size === "lg" ? "text-[clamp(34px,6vw,52px)]" : "text-[clamp(26px,5vw,38px)]",
              )}
            >
              {amount}
            </span>
          </div>
          <div className="grid justify-items-end gap-0.5 text-right">
            {sender && size !== "sm" && (
              <span className="truncate text-[11px] opacity-80">{t("promo.visual.from", { name: sender })}</span>
            )}
            {code && size !== "sm" && (
              <span className="font-[family-name:var(--gt-font-mono)] text-[10px] font-semibold tracking-[.08em] opacity-80">
                {code}
              </span>
            )}
          </div>
        </div>
      </div>
    </figure>
  );
}

/**
 * Campaign banner: an optional brand photo under a theme wash, with the
 * customer-facing headline. The headline takes the script face — this is the
 * one "editorial accent" the brief allows in the admin, and it is only ever a
 * few words long.
 */
export function CampaignCover({
  theme,
  cover,
  title,
  eyebrow,
  subtitle,
  size = "md",
  className,
  children,
}: {
  theme: CampaignTheme;
  cover: string | null;
  title?: string;
  eyebrow?: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  children?: React.ReactNode;
}) {
  const dark = theme === "noir" || theme === "winter";
  return (
    <div
      data-theme={theme}
      className={clsx(
        "gt-campaign-cover relative isolate overflow-hidden",
        size === "sm" ? "min-h-[112px]" : size === "lg" ? "min-h-[clamp(220px,32vw,320px)]" : "min-h-[160px]",
        className,
      )}
    >
      {cover && (
        <img
          src={photo(cover)}
          alt=""
          loading="lazy"
          className="gt-campaign-photo absolute inset-0 -z-10 h-full w-full object-cover"
        />
      )}
      <span aria-hidden="true" className="gt-campaign-wash absolute inset-0 -z-10" />
      <Sparkles className="text-[var(--gt-white)] opacity-80" />
      <div
        className={clsx(
          "relative flex h-full min-h-[inherit] flex-col justify-end gap-1",
          size === "sm" ? "p-4" : size === "lg" ? "p-[clamp(20px,4vw,40px)]" : "p-5",
          dark ? "text-[var(--gt-off-white)]" : "text-[var(--gt-ink-900)]",
        )}
      >
        {eyebrow && (
          <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] opacity-85">{eyebrow}</span>
        )}
        {title && (
          <span
            className={clsx(
              "gt-script block",
              size === "sm" ? "text-[26px]" : size === "lg" ? "text-[clamp(40px,6vw,68px)]" : "text-[34px]",
            )}
          >
            {title}
          </span>
        )}
        {subtitle && (
          <span className={clsx("max-w-[52ch] text-[length:var(--text-caption)] opacity-90", size === "lg" && "text-[length:var(--text-body-sm)]")}>
            {subtitle}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
