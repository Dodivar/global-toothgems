import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Flag, Languages, ThumbsUp } from "lucide-react";
import clsx from "clsx";
import monogram from "../../assets/monogram-blue.png";
import { Stars } from "./Stars";
import { VerifiedBadge } from "./ReviewBadges";
import { type CustomerReview } from "../../data/reviewSystem";
import { publicDate } from "../../lib/reviewRules";
import { useReviewAuthor, useReviews } from "../../lib/reviews";
import { formatDate } from "../../lib/format";

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/** Past this many characters the body folds behind "Read more". */
const FOLD_AT = 280;

/** Soft pastel per author, so a column of cards is not a column of identical grey circles. */
const AVATAR_TONES = ["var(--gt-blue-100)", "var(--gt-emerald-50)", "var(--gt-fuchsia-50)", "var(--gt-sand)"];

function toneFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/**
 * One customer review on a product or course page.
 *
 * Reads top to bottom as trust is built: who (a privacy name and the
 * verification), how they rated it, what they said, what they showed, and —
 * set apart — what Global Toothgems answered. "Helpful" and "Report" close the
 * card as quiet text buttons: the review is the content, not its controls.
 */
export function ReviewCard({ review, featured = false }: { review: CustomerReview; featured?: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("en") ? "en" : "fr";
  const authorOf = useReviewAuthor();
  const { helpfulByMe, toggleHelpful, reportedByMe, openReport, openPhotos } = useReviews();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();

  const author = authorOf(review);
  const long = review.body.length > FOLD_AT;
  const body = long && !expanded ? `${review.body.slice(0, FOLD_AT).trimEnd()}…` : review.body;
  const voted = helpfulByMe.has(review.id);
  const reported = reportedByMe.has(review.id);
  const course = review.subject.kind === "course";

  return (
    <article
      aria-labelledby={`${bodyId}-title`}
      className={clsx(
        "grid content-start gap-3.5 rounded-[var(--radius-card)] border bg-[var(--surface-card)] p-[clamp(16px,2.4vw,24px)] transition-shadow duration-[var(--duration-normal)] hover:shadow-[var(--shadow-sm)]",
        featured ? "border-[var(--gt-blue-200)] shadow-[var(--shadow-sm)]" : "border-[var(--border-subtle)]",
      )}
    >
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 flex-none place-items-center rounded-full text-[length:var(--text-caption)] font-bold text-[var(--gt-ink-800)]"
          style={{ background: toneFor(author) }}
        >
          {author.charAt(0)}
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{author}</strong>
            <VerifiedBadge review={review} />
          </div>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <time dateTime={publicDate(review)}>{formatDate(publicDate(review))}</time>
            {course && review.progressPct != null && (
              <>
                {" · "}
                {review.progressPct >= 100
                  ? t("reviews.card.completedCourse")
                  : t("reviews.card.progressAt", { pct: review.progressPct })}
              </>
            )}
          </span>
        </div>
      </header>

      <div className="grid gap-1.5">
        <Stars rating={review.rating} size={15} />
        <h3 id={`${bodyId}-title`} className="text-[length:var(--text-body-md)] leading-[var(--leading-snug)]">
          {review.title}
        </h3>
      </div>

      <div className="grid gap-2">
        {/* The customer's own words, in their own language. `lang` lets a
            screen reader pronounce a French review in French on the English site. */}
        <p lang={review.lang} id={bodyId} className="m-0 whitespace-pre-line text-[length:var(--text-body-sm)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">
          {body}
        </p>
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={bodyId}
            className={clsx("justify-self-start rounded-[2px] text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] underline underline-offset-4", focusRing)}
          >
            {expanded ? t("reviews.card.readLess") : t("reviews.card.readMore")}
          </button>
        )}
        {review.lang !== lang && (
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-subtle)]">
            <Languages size={12} aria-hidden="true" />
            {t(`reviews.card.writtenIn.${review.lang}`)}
          </span>
        )}
      </div>

      {review.tags.length > 0 && (
        <ul aria-label={t("reviews.card.tagsLabel")} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {review.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-[var(--radius-pill)] bg-[var(--surface-brand-wash)] px-2.5 py-1 text-[11px] font-semibold text-[var(--gt-blue-700)]"
            >
              {t(`reviews.tags.${tag}`)}
            </li>
          ))}
        </ul>
      )}

      {review.photos.length > 0 && (
        <ul aria-label={t("reviews.card.photosLabel", { count: review.photos.length })} className="m-0 flex list-none flex-wrap gap-2 p-0">
          {review.photos.map((p, i) => (
            <li key={p.src + i}>
              <button
                type="button"
                onClick={() => openPhotos({ photos: review.photos, index: i, caption: t("reviews.photos.sharedBy", { name: author }) })}
                aria-label={t("reviews.photos.open", { index: i + 1, total: review.photos.length, alt: p.alt || t("reviews.photos.fallbackAlt", { name: author }) })}
                className={clsx(
                  "group block h-[76px] w-[76px] overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)] sm:h-[88px] sm:w-[88px]",
                  focusRing,
                )}
              >
                <img
                  src={p.src}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] group-hover:scale-105"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {review.response && (
        <div className="grid gap-2 rounded-[var(--radius-md)] border-l-2 border-[var(--gt-blue-300)] bg-[var(--surface-brand-wash)] px-4 py-3">
          <span className="flex flex-wrap items-center gap-2 text-[length:var(--text-caption)]">
            <img src={monogram} alt="" aria-hidden="true" className="h-4 w-auto" />
            <strong className="text-[var(--text-primary)]">{t("reviews.response.from")}</strong>
            <span className="text-[var(--text-muted)]">
              · <time dateTime={review.response.at}>{formatDate(review.response.at)}</time>
            </span>
          </span>
          <p className="m-0 whitespace-pre-line text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-body)]">
            {review.response.body}
          </p>
        </div>
      )}

      <footer className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3 text-[length:var(--text-caption)]">
        <button
          type="button"
          onClick={() => toggleHelpful(review.id)}
          aria-pressed={voted}
          className={clsx(
            "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 font-semibold transition-colors duration-[var(--duration-fast)]",
            voted
              ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
              : "border-[var(--border-subtle)] text-[var(--text-body)] hover:border-[var(--border-default)] hover:bg-[var(--gt-ink-100)]",
            focusRing,
          )}
        >
          <ThumbsUp size={13} aria-hidden="true" fill={voted ? "currentColor" : "none"} />
          {t("reviews.card.helpful")}
          <span className="tabular-nums">· {review.helpful}</span>
        </button>

        {reported ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
            <Check size={13} aria-hidden="true" />
            {t("reviews.card.reported")}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => openReport(review.id)}
            className={clsx(
              "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-pill)] px-2 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <Flag size={12} aria-hidden="true" />
            {t("reviews.card.report")}
            <span className="sr-only">{t("reviews.card.reportTarget", { name: author })}</span>
          </button>
        )}
      </footer>
    </article>
  );
}

/** Placeholder with the card's shape, so the list does not jump when reviews arrive. */
export function ReviewCardSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-3.5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6">
      <div className="flex items-center gap-3">
        <div className="gt-skeleton h-10 w-10 rounded-full" />
        <div className="grid flex-1 gap-2">
          <div className="gt-skeleton h-3 w-28 rounded-full" />
          <div className="gt-skeleton h-2.5 w-20 rounded-full" />
        </div>
      </div>
      <div className="gt-skeleton h-3 w-24 rounded-full" />
      <div className="gt-skeleton h-3.5 w-2/3 rounded-full" />
      <div className="grid gap-2">
        <div className="gt-skeleton h-2.5 w-full rounded-full" />
        <div className="gt-skeleton h-2.5 w-11/12 rounded-full" />
        <div className="gt-skeleton h-2.5 w-3/5 rounded-full" />
      </div>
    </div>
  );
}
