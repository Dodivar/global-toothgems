import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import clsx from "clsx";

/**
 * Star ratings, read-only and interactive.
 *
 * Read-only stars are one image with a text alternative ("Rated 4 out of 5"):
 * five separate icons would be read as five meaningless graphics. Ink on
 * white, like the rest of the storefront's ratings — the stars carry the
 * number, not a colour.
 */
export function Stars({
  rating,
  size = 14,
  className,
  tone = "ink",
}: {
  rating: number;
  size?: number;
  className?: string;
  tone?: "ink" | "inverse";
}) {
  const { t } = useTranslation();
  const filled = tone === "ink" ? "var(--gt-ink-900)" : "var(--gt-off-white)";
  const empty = tone === "ink" ? "var(--gt-ink-300)" : "rgba(250,250,248,.35)";
  return (
    <span
      className={clsx("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={t("review.starsAria", { rating: Number.isInteger(rating) ? rating : rating.toFixed(1) })}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        // Half a star from .25 up to .75, so a 4.6 average reads as nearly five.
        const fraction = Math.max(0, Math.min(1, rating - i));
        const full = fraction >= 0.75;
        const half = !full && fraction >= 0.25;
        return (
          <span key={i} className="relative inline-flex" aria-hidden="true">
            <Star size={size} fill={full ? filled : "none"} color={full || half ? filled : empty} strokeWidth={1.75} />
            {half && (
              <span className="absolute inset-y-0 left-0 w-1/2 overflow-hidden">
                <Star size={size} fill={filled} color={filled} strokeWidth={1.75} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

const LABEL_KEYS = ["", "reviews.stars.1", "reviews.stars.2", "reviews.stars.3", "reviews.stars.4", "reviews.stars.5"];

/**
 * The rating input: five radio buttons drawn as stars.
 *
 * A radio group gives keyboard users one tab stop and arrow keys, and screen
 * readers "3 stars — Good, 3 of 5" with no ARIA of our own. Hovering previews
 * a value without choosing it; the word for the current value is printed
 * beside the stars, so the choice never depends on reading the icons.
 */
export function StarInput({
  value,
  onChange,
  label,
  invalid,
  describedBy,
  size = 32,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  invalid?: boolean;
  describedBy?: string;
  size?: number;
}) {
  const { t } = useTranslation();
  const name = useId();
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <fieldset
      className="m-0 grid gap-2 border-0 p-0"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onMouseLeave={() => setHover(0)}
    >
      <legend className="mb-2 p-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{label}</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => {
            const lit = n <= shown;
            return (
              <label
                key={n}
                onMouseEnter={() => setHover(n)}
                className={clsx(
                  "relative grid cursor-pointer place-items-center rounded-[var(--radius-sm)] p-1 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] hover:scale-110",
                  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--focus-ring)]",
                )}
              >
                <input
                  type="radio"
                  name={name}
                  value={n}
                  checked={value === n}
                  onChange={() => onChange(n)}
                  className="sr-only"
                  aria-label={t("reviews.stars.option", { count: n, label: t(LABEL_KEYS[n]) })}
                />
                <Star
                  aria-hidden="true"
                  size={size}
                  strokeWidth={1.5}
                  fill={lit ? "var(--gt-ink-900)" : "transparent"}
                  color={lit ? "var(--gt-ink-900)" : invalid ? "var(--gt-red-400)" : "var(--gt-ink-300)"}
                  // Keyed on the value so each new choice replays the pop once.
                  key={lit && n === value ? `on-${value}` : "off"}
                  className={clsx("transition-colors duration-[var(--duration-fast)]", lit && n === value && "gt-pop-in")}
                />
              </label>
            );
          })}
        </div>
        <span aria-hidden="true" className="min-w-[8ch] text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)]">
          {shown ? t(LABEL_KEYS[shown]) : t("reviews.stars.none")}
        </span>
      </div>
    </fieldset>
  );
}
