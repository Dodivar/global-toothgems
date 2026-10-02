import { useTranslation } from "react-i18next";
import { ArrowRight, Clock, GraduationCap, ListVideo } from "lucide-react";
import clsx from "clsx";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Link } from "../../lib/navigation";
import { pick } from "../../data/types";
import { courseHref } from "../../lib/academyUrl";
import { courseSlug, isDiscounted, lessonCount, type PublicCourse } from "../../lib/academy/publicCourse";
import { useFormat } from "../../lib/format";
import { formatDuration } from "../../lib/trainingFilters";

export interface CourseCardBadge {
  label: string;
  tone: BadgeTone;
}

/**
 * The editorial course card shared by the home page's Academy band and the
 * Academy marketplace: image, level, theme, size and length, title, what it
 * teaches, and the way in. Its whole surface opens the training's own page
 * (a real link, so the page can be opened in a new tab and crawled).
 *
 * The card answers "could this course be for me?" and no more: the
 * programme, the assessment and the certificate are the training page's.
 * The home page leaves the price to that page (`showPrice` off); the
 * marketplace shows it, since comparing is what it is for.
 */
export function AcademyCourseCard({
  course,
  lang,
  featured = false,
  showPrice = false,
  showCategory = false,
  clampSummary = false,
  badges = [],
  heading: Heading = "h3",
  ctaLabel,
  highlighted = false,
}: {
  course: PublicCourse;
  lang: string;
  /** Wider image and larger title, for the first card of the home page's row. */
  featured?: boolean;
  showPrice?: boolean;
  showCategory?: boolean;
  /** Two lines of summary at most, so a grid of cards keeps an even rhythm. */
  clampSummary?: boolean;
  /** Shown over the image after the level (new, for you, …). */
  badges?: CourseCardBadge[];
  heading?: "h3" | "h4";
  ctaLabel: string;
  /** Matches the visitor's chosen starting point: a ring as well as the badge, never the colour alone. */
  highlighted?: boolean;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const title = pick(course.title, lang);
  const locale = lang.startsWith("en") ? "en" : "fr";
  const discounted = isDiscounted(course);

  return (
    <article
      className={clsx(
        "gt-alt-course group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border bg-[var(--surface-card)] shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] focus-within:-translate-y-1 focus-within:shadow-[var(--shadow-card-hover)]",
        highlighted ? "border-[var(--gt-fuchsia-300)] ring-2 ring-[var(--gt-fuchsia-300)]/50" : "border-[var(--border-subtle)]",
      )}
    >
      <div className={clsx("relative overflow-hidden bg-[var(--surface-sunken)]", featured ? "aspect-[16/10]" : "aspect-[4/3]")}>
        {course.cover ? (
          <img
            src={course.cover.src}
            alt=""
            loading="lazy"
            decoding="async"
            className="gt-alt-tile-art absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-[var(--surface-brand-wash)] text-[var(--gt-blue-500)]">
            <GraduationCap size={32} strokeWidth={1.5} />
          </span>
        )}
        <span className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge tone="ink" size="sm">{t(`academy.levels.${course.level}`)}</Badge>
          {badges.map((badge) => (
            <Badge key={badge.label} tone={badge.tone} size="sm">{badge.label}</Badge>
          ))}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-[clamp(20px,2vw,28px)]">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
          {showCategory && <span className="text-[var(--gt-blue-700)]">{t(`academy.categories.${course.category}`)}</span>}
          <span className="inline-flex items-center gap-1.5">
            <ListVideo size={13} aria-hidden="true" />
            {t("course.lessonCount", { count: lessonCount(course) })}
          </span>
          {course.minutes > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Clock size={13} aria-hidden="true" />
              {formatDuration(course.minutes, lang)}
            </span>
          )}
        </span>
        <Heading className={clsx("font-bold leading-tight text-[var(--text-primary)]", featured ? "text-[clamp(22px,1.8vw,28px)]" : "text-[19px]")}>
          {/* Stretched link: the whole card is clickable, the keyboard gets one stop. */}
          <Link
            to={courseHref(courseSlug(course, locale))}
            className="rounded-[var(--radius-xs)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
          >
            {title}
          </Link>
        </Heading>
        {course.summary && (
          <p className={clsx("m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]", clampSummary && "line-clamp-2")}>
            {pick(course.summary, lang)}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2">
          {showPrice && (
            <span className="flex flex-wrap items-baseline gap-2">
              <strong className="text-[18px] font-bold text-[var(--text-primary)]">
                {discounted && <span className="sr-only">{t("training.priceNow")} </span>}
                {formatMoney(course.currentPrice.minor, course.currentPrice.currency)}
              </strong>
              {discounted && (
                <s className="text-[13px] text-[var(--text-subtle)]">
                  <span className="sr-only">{t("training.priceWas")} </span>
                  {formatMoney(course.price.minor, course.price.currency)}
                </s>
              )}
            </span>
          )}
          <span aria-hidden="true" className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)]">
            {ctaLabel}
            <ArrowRight size={15} className="gt-alt-tile-arrow" />
          </span>
        </div>
      </div>
    </article>
  );
}
