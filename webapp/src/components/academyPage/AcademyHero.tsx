import { useTranslation } from "react-i18next";
import { ArrowRight, Award, Compass, MonitorPlay, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
import { Link } from "../../lib/navigation";
import { pick } from "../../data/types";
import { photo } from "../../lib/images";
import { courseHref } from "../../lib/academyUrl";
import { courseSlug, type PublicCourse } from "../../lib/academy/publicCourse";
import { formatDuration } from "../../lib/trainingFilters";

/**
 * The marketplace's opening: what the Academy is, in one line, and the two
 * ways in — the catalogue, or the starting-point picker. The composition is
 * aspirational (a smile, a placement in progress, gems in the air) rather
 * than instructional; the one "course" element on it is the real featured
 * course, and the figures are counted from the published catalogue.
 */
export function AcademyHero({
  courses,
  featured,
  lang,
  onExplore,
  onFindStart,
}: {
  courses: PublicCourse[];
  featured: PublicCourse | undefined;
  lang: string;
  onExplore: () => void;
  /** Absent when the starting-point picker is not on the page. */
  onFindStart?: () => void;
}) {
  const { t } = useTranslation();
  const locale = lang.startsWith("en") ? "en" : "fr";
  const certificate = courses.some((course) => course.issuesCertificate);

  const highlights = [
    courses.length > 0 && { icon: Sparkles, label: t("academyPage.hero.chipCourses", { count: courses.length }) },
    { icon: MonitorPlay, label: t("academyPage.hero.chipPace") },
    certificate && { icon: Award, label: t("academyPage.hero.chipCertificate") },
  ].filter((item): item is { icon: typeof Sparkles; label: string } => Boolean(item));

  return (
    <header className="gt-academy-hero relative overflow-hidden">
      <div className="gt-alt-wide relative grid items-center gap-[clamp(40px,6vw,96px)] px-[var(--gt-alt-gutter)] pb-[clamp(48px,7vw,112px)] pt-[clamp(36px,5vw,80px)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="grid content-center justify-items-start gap-6">
          <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("academyPage.hero.eyebrow")}</span>
          <span aria-hidden="true" className="gt-accent -mb-3 text-[clamp(20px,2.2vw,28px)] text-[var(--gt-blue-700)]">
            {t("academyPage.hero.script")}
          </span>
          <h1 className="gt-alt-display max-w-[13ch]">{t("academyPage.hero.title")}</h1>
          <p className="m-0 max-w-[52ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("academyPage.hero.body")}</p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta" onClick={onExplore}>
              {t("academyPage.hero.cta")}
            </Button>
            {onFindStart && (
              <Button variant="glass" size="lg" iconLeft={Compass} onClick={onFindStart}>
                {t("academyPage.hero.ctaSecondary")}
              </Button>
            )}
          </div>
          <ul aria-label={t("academyPage.hero.highlightsLabel")} className="m-0 flex list-none flex-wrap gap-2 p-0 pt-2">
            {highlights.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-white/70 bg-white/60 px-3.5 py-2 text-[13px] font-semibold text-[var(--text-primary)] backdrop-blur-sm"
              >
                <Icon size={15} strokeWidth={1.9} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* The visual: an arched portrait, a placement in progress and two gems
            floating over the wash. Kept to three pieces so it never crowds the copy. */}
        <div className="relative mx-auto w-full max-w-[560px]">
          <div className="gt-alt-arch relative mx-auto aspect-[4/5] w-[78%] overflow-hidden shadow-[var(--shadow-lg)] sm:w-[70%] lg:w-[78%]">
            <img
              src={photo("mouth-05.jpg")}
              alt={t("academyPage.hero.imageAlt")}
              fetchPriority="high"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
          <span aria-hidden="true" className="gt-alt-float absolute left-0 top-[46%] block aspect-square w-[30%] max-w-[170px] overflow-hidden rounded-full border-[5px] border-white shadow-[var(--shadow-lg)]">
            <img src={photo("mouth-04.jpg")} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          </span>
          <img
            src={photo("img-07.jpg")}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="gt-alt-cutout gt-alt-float gt-alt-float--late absolute right-[2%] top-[4%] w-[17%] max-w-[96px]"
          />
          <img
            src={photo("img-19.jpg")}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="gt-alt-cutout gt-alt-float absolute left-[12%] top-[2%] hidden w-[11%] max-w-[64px] sm:block"
          />
          {featured && (
            <div className="gt-glass-panel gt-glass-panel-compact absolute bottom-[-4%] right-0 grid w-[min(76%,300px)] gap-1.5 rounded-[var(--radius-lg)] p-4 sm:bottom-[4%]">
              <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--accent-highlight-ink)]">
                {t("academyPage.hero.featuredLabel")}
              </span>
              <Link
                to={courseHref(courseSlug(featured, locale))}
                className="text-[15px] font-bold leading-snug text-[var(--text-primary)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
              >
                {pick(featured.title, lang)}
              </Link>
              <span className="text-[12px] text-[var(--text-muted)]">
                {t(`academy.levels.${featured.level}`)}
                {featured.minutes > 0 && ` · ${formatDuration(featured.minutes, lang)}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
