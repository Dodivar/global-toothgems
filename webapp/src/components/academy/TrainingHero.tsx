import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Award, Check, Clock, Layers, ListVideo, Lock, PlayCircle, SignalHigh } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { MetaPill } from "./TrainingPrimitives";
import type { Course } from "../../data/courses";
import { pick } from "../../data/types";
import type { CourseProgress } from "../../lib/progress";
import { formatPrice } from "../../lib/format";

/**
 * The training hero.
 *
 * Above the fold it answers four questions and no more: what this training is,
 * what it contains, what it costs, how to start. Everything else — outcomes,
 * curriculum, assessment, diploma, community — is a section further down, which
 * is what keeps the top of the page desirable rather than dense.
 *
 * The image spans both rows of the left column on wide screens; on a phone the
 * source order (headline, image, details) puts the artwork directly under the
 * title, so the training still reads as an experience on first paint.
 */
export function TrainingHero({
  course,
  lang,
  progress,
  signedIn,
  moduleCount,
  ctaRef,
  onStart,
  onExploreCurriculum,
}: {
  course: Course;
  lang: string;
  progress: CourseProgress;
  signedIn: boolean;
  moduleCount: number;
  /** Watched by the page so the sticky mobile bar only appears once this scrolls away. */
  ctaRef: RefObject<HTMLDivElement | null>;
  onStart: () => void;
  onExploreCurriculum: () => void;
}) {
  const { t } = useTranslation();
  const title = pick(course.title, lang);

  const startLabel = progress.completed
    ? t("training.ctaReview")
    : progress.enrolled
      ? t("training.ctaResume")
      : t("training.ctaStart");

  const included = [t("training.heroCardItem1"), t("training.heroCardItem2"), t("training.heroCardItem3")];

  return (
    <header className="relative overflow-hidden bg-[var(--surface-page)] px-[clamp(14px,4vw,48px)] pb-[clamp(40px,6vw,72px)] pt-[clamp(20px,3vw,36px)]">
      {/* The brand's gem wash, kept faint: it separates the Academy from the
          storefront without ever competing with the title. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(60% 55% at 8% 0%, var(--gt-blue-100) 0%, transparent 62%), radial-gradient(45% 45% at 92% 8%, var(--gt-emerald-50) 0%, transparent 60%), radial-gradient(40% 40% at 78% 96%, var(--gt-fuchsia-50) 0%, transparent 62%)",
        }}
      />

      <div className="relative mx-auto max-w-[var(--max-width-content)]">
        <nav
          aria-label={t("lesson.breadcrumbAcademy")}
          className="mb-[clamp(20px,3vw,32px)] flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-muted)]"
        >
          <Link to="/academy" className="underline decoration-1 underline-offset-2">
            {t("lesson.breadcrumbAcademy")}
          </Link>
          <span aria-hidden="true">·</span>
          <span className="text-[var(--text-primary)]" aria-current="page">
            {title}
          </span>
        </nav>

        <div className="grid items-start gap-[clamp(28px,4vw,56px)] lg:grid-cols-[minmax(0,1.18fr)_minmax(0,.82fr)]">
          <div className="grid gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{t("training.eyebrow")}</Badge>
              <Badge tone="neutral">{pick(course.level, lang)}</Badge>
              {progress.completed && <Badge tone="success">{t("course.stateCompleted")}</Badge>}
              {progress.enrolled && !progress.completed && <Badge tone="highlight">{t("course.stateEnrolled")}</Badge>}
            </div>
            {/* The one decorative-script moment at the top of the page. The
                breadcrumb already names the Academy, so it is purely visual. */}
            <span aria-hidden="true" className="gt-script -mb-3 text-[clamp(30px,4.4vw,46px)] text-[var(--gt-blue-400)]">
              {t("training.heroScript")}
            </span>
            <h1 className="max-w-[16ch] text-[length:var(--text-display-2)] font-[var(--weight-black)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]">
              {title}
            </h1>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-lg)] text-[var(--text-body)]">
              {pick(course.copy, lang)}
            </p>
          </div>

          {/* Artwork column: spans both rows of the left column on wide screens. */}
          <div className="relative lg:row-span-2">
            <div className="gt-sparkle relative aspect-[4/5] overflow-hidden rounded-[var(--radius-xl)] bg-[var(--surface-sunken)] shadow-[var(--shadow-lg)] sm:aspect-[3/2] lg:aspect-[4/5]">
              <img
                src={course.image}
                alt={t("training.heroImageAlt")}
                fetchPriority="high"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            {/* What the purchase includes, on the page's one deep-glass panel.
                Overlaid from `sm` up, stacked underneath on a phone where an
                overlay would sit on top of the subject. */}
            <div className="gt-glass-panel gt-glass-panel-compact mt-4 grid gap-3 rounded-[var(--radius-lg)] p-[var(--space-5)] sm:absolute sm:inset-x-4 sm:bottom-4 sm:mt-0">
              <span className="gt-eyebrow text-[var(--text-primary)]">{t("training.heroCardTitle")}</span>
              <ul className="m-0 grid list-none gap-2 p-0">
                {included.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                    <Check size={15} strokeWidth={2.5} aria-hidden="true" className="mt-[3px] flex-none text-[var(--accent-cta-ink)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-6">
            <dl aria-label={t("training.heroMetaLabel")} className="m-0 flex flex-wrap gap-2.5">
              <MetaPill icon={SignalHigh} label={t("training.metaLevel")} value={pick(course.level, lang)} />
              <MetaPill icon={Layers} label={t("training.metaModulesLabel")} value={t("training.metaModules", { count: moduleCount })} />
              <MetaPill icon={ListVideo} label={t("training.metaLessonsLabel")} value={t("course.lessonCount", { count: course.lessonCount })} />
              <MetaPill icon={Clock} label={t("training.metaDurationLabel")} value={course.duration} />
              <MetaPill icon={Award} label={t("training.metaDiplomaLabel")} value={t("training.metaDiploma")} />
            </dl>

            {progress.enrolled && !progress.completed && (
              <ProgressBar
                value={progress.pct}
                size="sm"
                label={t("lesson.progressLabel", { done: progress.doneCount, total: progress.total })}
              />
            )}

            <div ref={ctaRef} className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <div className="grid gap-0.5">
                <strong className="text-[32px] font-[var(--weight-black)] leading-none tracking-[var(--tracking-tight)] text-[var(--text-primary)]">
                  {formatPrice(course.price)}
                </strong>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("training.priceNote")}</span>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="lg" onClick={onStart}>
                  {startLabel}
                </Button>
                <Button variant="ghost" size="lg" iconLeft={PlayCircle} onClick={onExploreCurriculum}>
                  {t("training.ctaCurriculum")}
                </Button>
              </div>
            </div>

            {!signedIn && (
              <p className="m-0 flex items-center gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                <Lock size={14} aria-hidden="true" />
                {t("academy.accountRequired")}
              </p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
