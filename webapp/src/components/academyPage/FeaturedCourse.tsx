import { useTranslation } from "react-i18next";
import { ArrowRight, Award, Clock, GraduationCap, ListVideo, SignalHigh } from "lucide-react";
import clsx from "clsx";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Link } from "../../lib/navigation";
import { pick } from "../../data/types";
import { courseHref } from "../../lib/academyUrl";
import { courseSlug, isDiscounted, lessonCount, type PublicCourse } from "../../lib/academy/publicCourse";
import { useFormat } from "../../lib/format";
import { formatDuration } from "../../lib/trainingFilters";

/**
 * One course put forward like a magazine feature: a large visual, a label, the
 * title, its promise in a sentence, four facts and the price. The whole panel
 * opens the course's page (one keyboard stop, on the title). What the course
 * contains and how it runs stay on that page.
 */
export function FeaturedCourse({
  course,
  lang,
  badges = [],
  highlighted = false,
}: {
  course: PublicCourse;
  lang: string;
  badges?: { label: string; tone: BadgeTone }[];
  highlighted?: boolean;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const locale = lang.startsWith("en") ? "en" : "fr";
  const discounted = isDiscounted(course);

  const facts = [
    { icon: SignalHigh, label: t(`academy.levels.${course.level}`) },
    course.minutes > 0 && { icon: Clock, label: formatDuration(course.minutes, lang) },
    { icon: ListVideo, label: t("course.lessonCount", { count: lessonCount(course) }) },
    course.issuesCertificate && { icon: Award, label: t("academyPage.card.certificate") },
  ].filter((fact): fact is { icon: typeof Clock; label: string } => Boolean(fact));

  return (
    <article
      className={clsx(
        "gt-academy-featured group relative grid overflow-hidden rounded-[var(--radius-xl)] text-[var(--gt-ink-300)] shadow-[var(--shadow-lg)] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]",
        highlighted && "ring-2 ring-[var(--gt-fuchsia-300)] ring-offset-4 ring-offset-[var(--gt-sand)]",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--gt-ink-800)] sm:aspect-[16/9] lg:aspect-auto lg:min-h-[460px]">
        {course.cover ? (
          <img
            src={course.cover.src}
            alt={course.cover.alt ? pick(course.cover.alt, lang) : ""}
            decoding="async"
            className="gt-alt-tile-art absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-[var(--gt-blue-300)]">
            <GraduationCap size={48} strokeWidth={1.25} />
          </span>
        )}
        <span className="absolute left-4 top-4 flex flex-wrap gap-2">
          <Badge tone="highlight">{t("academyPage.featured.label")}</Badge>
          {badges.map((badge) => (
            <Badge key={badge.label} tone={badge.tone}>{badge.label}</Badge>
          ))}
        </span>
      </div>

      <div className="grid content-center gap-5 p-[clamp(24px,4vw,56px)]">
        <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
          {t(`academy.categories.${course.category}`)}
        </span>
        <h3 className="text-[clamp(28px,3vw,44px)] font-[var(--weight-black)] leading-[1.05] tracking-[var(--tracking-display)] text-[var(--gt-off-white)]">
          <Link
            to={courseHref(courseSlug(course, locale))}
            className="rounded-[var(--radius-xs)] text-[var(--gt-off-white)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--gt-blue-300)]"
          >
            {pick(course.title, lang)}
          </Link>
        </h3>
        {course.summary && <p className="m-0 max-w-[46ch] text-[length:var(--text-body-lg)]">{pick(course.summary, lang)}</p>}
        <ul aria-label={t("academyPage.featured.metaLabel")} className="m-0 flex list-none flex-wrap gap-2 p-0">
          {facts.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-white/15 px-3 py-1.5 text-[12px] font-semibold text-[var(--gt-off-white)]">
              <Icon size={14} aria-hidden="true" className="text-[var(--gt-blue-300)]" />
              {label}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/12 pt-5">
          <span className="flex flex-wrap items-baseline gap-2">
            <strong className="text-[28px] font-[var(--weight-black)] text-[var(--gt-off-white)]">
              {discounted && <span className="sr-only">{t("training.priceNow")} </span>}
              {formatMoney(course.currentPrice.minor, course.currentPrice.currency)}
            </strong>
            {discounted && (
              <s className="text-[15px]">
                <span className="sr-only">{t("training.priceWas")} </span>
                {formatMoney(course.price.minor, course.price.currency)}
              </s>
            )}
          </span>
          <span
            aria-hidden="true"
            className="gt-academy-featured-cta inline-flex h-12 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--accent-cta)] px-6 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-on-accent)]"
          >
            {t("academyPage.featured.cta")}
            <ArrowRight size={16} className="gt-alt-tile-arrow" />
          </span>
        </div>
      </div>
    </article>
  );
}
