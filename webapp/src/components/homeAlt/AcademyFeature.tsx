import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "../../lib/navigation";
import { ArrowRight, Clock, Gem, GraduationCap, ListVideo, Palette, ShieldCheck, Sparkles } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { pick } from "../../data/types";
import { courseHref } from "../../lib/academyUrl";
import { useAcademy } from "../../lib/academy/AcademyProvider";
import { courseSlug, lessonCount, type PublicCourse } from "../../lib/academy/publicCourse";
import { formatDuration } from "../../lib/trainingFilters";
import { useReveal } from "../../lib/useReveal";

const PILLARS = [
  { key: "pillar1", icon: Sparkles },
  { key: "pillar2", icon: Gem },
  { key: "pillar3", icon: ShieldCheck },
  { key: "pillar4", icon: Palette },
] as const;

/**
 * The Academy as an aspiration rather than a catalogue: a large statement,
 * what the training covers, then the published courses as editorial cards
 * (none shown until one is online). No course price is shown on the home
 * page — the price belongs to the training's own page, which every card opens.
 */
export function AcademyFeature() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { courses } = useAcademy();
  const ref = useReveal<HTMLElement>();
  const lang = i18n.language;

  return (
    <section ref={ref} aria-labelledby="gt-alt-academy-title" className="gt-reveal gt-alt-section gt-alt-academy w-full">
      <div className="gt-alt-wide px-[var(--gt-alt-gutter)]">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-[clamp(48px,7vw,140px)]">
          <div className="grid content-start justify-items-start gap-6">
            <span className="gt-eyebrow !text-[var(--gt-blue-700)]">{t("homeAlt.academy.eyebrow")}</span>
            <h2 id="gt-alt-academy-title" className="gt-alt-display max-w-[14ch]">
              {t("homeAlt.academy.title")}
            </h2>
            <p className="m-0 max-w-[56ch] text-[length:var(--text-body-lg)] text-[var(--text-body)]">{t("homeAlt.academy.body")}</p>
            <Button variant="primary" size="lg" iconRight={ArrowRight} className="gt-alt-cta max-sm:!h-auto max-sm:min-h-14 max-sm:py-3 max-sm:!whitespace-normal max-sm:text-center" onClick={() => navigate("/academy")}>
              {t("homeAlt.academy.cta")}
            </Button>
          </div>

          <div className="grid content-end">
            <h3 className="gt-eyebrow mb-2">{t("homeAlt.academy.pillarsLabel")}</h3>
            <ul className="m-0 grid list-none p-0 sm:grid-cols-2 lg:grid-cols-1">
              {PILLARS.map(({ key, icon: Icon }, i) => (
                <li key={key} className="grid grid-cols-[auto_1fr] items-start gap-4 border-t border-[var(--gt-ink-200)] py-4 sm:py-5 sm:pr-6 lg:pr-0">
                  <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-full bg-[var(--gt-white)] text-[var(--gt-blue-700)] shadow-[var(--shadow-sm)]">
                    <Icon size={19} strokeWidth={1.75} />
                  </span>
                  <span className="grid gap-1">
                    <span className="flex items-baseline gap-3 text-[length:var(--text-h4)] font-bold text-[var(--text-primary)]">
                      <span aria-hidden="true" className="text-[11px] font-semibold tabular-nums tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-600)]">
                        0{i + 1}
                      </span>
                      {t(`homeAlt.academy.${key}Title`)}
                    </span>
                    <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">{t(`homeAlt.academy.${key}Body`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {courses.length > 0 && (
          <div className="mt-[clamp(56px,7vw,112px)]">
            <h3 className="gt-alt-h3 mb-6">{t("homeAlt.academy.coursesTitle")}</h3>
            {/* Phone: a swiped row that runs to the screen edge. */}
            <ul className="gt-scroller gt-alt-snap-pad -mx-[var(--gt-alt-gutter)] my-0 flex list-none gap-4 px-[var(--gt-alt-gutter)] pb-4 md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-6">
              {courses.slice(0, 3).map((course, i) => (
                <li key={course.id} className={clsx("w-[82%] max-w-[360px] flex-none snap-start md:w-auto md:max-w-none", i === 0 && "md:col-span-2 lg:col-span-1")}>
                  <AcademyCourseCard course={course} lang={lang} featured={i === 0} />
                </li>
              ))}
            </ul>
            <p className="m-0 mt-7 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("homeAlt.academy.footnote")}</p>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The home page's course card: image, level and length, title, what it
 * teaches, and the way in. Deliberately not the catalogue's `CourseCard`,
 * which shows a price and has no room for the description.
 */
function AcademyCourseCard({ course, lang, featured }: { course: PublicCourse; lang: string; featured: boolean }) {
  const { t } = useTranslation();
  const title = pick(course.title, lang);
  const locale = lang.startsWith("en") ? "en" : "fr";

  return (
    <article className="gt-alt-course group relative flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] transition-[transform,box-shadow] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)] focus-within:-translate-y-1 focus-within:shadow-[var(--shadow-card-hover)]">
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
          {featured && <Badge tone="brand" size="sm">{t("homeAlt.academy.featured")}</Badge>}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-[clamp(20px,2vw,28px)]">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
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
        <h4 className={clsx("font-bold leading-tight text-[var(--text-primary)]", featured ? "text-[clamp(22px,1.8vw,28px)]" : "text-[19px]")}>
          {/* Stretched link: the whole card is clickable, the keyboard gets one stop. */}
          <Link
            to={courseHref(courseSlug(course, locale))}
            className="rounded-[var(--radius-xs)] after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)]"
          >
            {title}
          </Link>
        </h4>
        {course.summary && <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-body)]">{pick(course.summary, lang)}</p>}
        <span aria-hidden="true" className="mt-auto inline-flex items-center gap-2 pt-2 text-[12px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)]">
          {t("homeAlt.academy.courseCta")}
          <ArrowRight size={15} className="gt-alt-tile-arrow" />
        </span>
      </div>
    </article>
  );
}
