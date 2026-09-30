"use client";

import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "../../lib/navigation";
import { ArrowRight, Award, LayoutDashboard, RotateCcw, Trophy } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { ProgressRing } from "../../components/learning/LearningStatus";
import { pick } from "../../data/types";
import { learnHref, lessonHref } from "../../lib/academyUrl";
import { useFormat } from "../../lib/format";
import { formatDuration } from "../../lib/trainingFilters";
import { LearnAccessState } from "./LearnAccessState";
import { useLearnerCourse } from "./useLearnerCourse";

/** Spark positions around the medal: a festive frame, not a confetti storm. */
const SPARKS = [
  { x: "-110px", y: "-54px", r: "20deg", c: "var(--accent-cta)" },
  { x: "112px", y: "-40px", r: "-30deg", c: "var(--gt-blue-300)" },
  { x: "-86px", y: "58px", r: "45deg", c: "var(--gt-blue-400)" },
  { x: "94px", y: "64px", r: "-12deg", c: "var(--accent-cta)" },
  { x: "0px", y: "-104px", r: "60deg", c: "var(--gt-fuchsia-300)" },
  { x: "-130px", y: "6px", r: "10deg", c: "var(--gt-emerald-300)" },
  { x: "134px", y: "12px", r: "-50deg", c: "var(--gt-blue-200)" },
];

/**
 * The end of a training.
 *
 * A moment, briefly: a medal, a few sparks that settle (and simply sit still
 * under reduced motion), the course, the date and the numbers that earned it,
 * then the ways on — the certificate first when the course issues one. Opened
 * before the course is actually complete, it says what is left instead of
 * congratulating anyone early.
 */
export function CourseCompleted() {
  const { formatDate } = useFormat();
  const { courseId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { product, access, training, summary, progress } = useLearnerCourse(courseId);

  if (!product || !access || access.state !== "open" || !training || !summary) {
    return <LearnAccessState access={access} courseId={courseId} />;
  }

  if (!progress.completed) {
    const next = summary.path[summary.nextIndex];
    return (
      <div className="mx-auto grid max-w-[560px] justify-items-center gap-4 px-4 py-[clamp(56px,10vw,120px)] text-center">
        <ProgressRing value={summary.pct} size={104} stroke={9} label={t("learning.courseProgress")} />
        <h1 className="text-[length:var(--text-h2)]">{t("learning.almostTitle")}</h1>
        <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-muted)]">
          {summary.quizAverage !== null && summary.doneCount === summary.total
            ? t("learning.almostScore", { score: summary.quizAverage, min: training.completion.minScore })
            : t("learning.almostBody", { count: summary.total - summary.doneCount })}
        </p>
        {next && (
          <Button variant="primary" iconRight={ArrowRight} onClick={() => navigate(lessonHref(courseId, next.key))}>
            {t("learning.continue")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="relative isolate overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--gt-blue-100),transparent_65%)]" />
      <section className="mx-auto grid max-w-[720px] justify-items-center gap-6 px-4 py-[clamp(48px,8vw,96px)] text-center">
        <div className="relative grid h-[168px] w-[168px] place-items-center">
          {SPARKS.map((spark, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="gt-learn-spark absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-[3px]"
              style={{ "--x": spark.x, "--y": spark.y, "--r": spark.r, background: spark.c, animationDelay: `${i * 40}ms` } as React.CSSProperties}
            />
          ))}
          <span className="gt-celebrate grid h-[132px] w-[132px] place-items-center rounded-full bg-[conic-gradient(from_210deg,var(--gt-emerald-300),var(--gt-blue-300),var(--gt-emerald-400),var(--gt-emerald-300))] p-2 shadow-[var(--shadow-lg)]">
            <span className="grid h-full w-full place-items-center rounded-full bg-[var(--surface-card)] text-[var(--accent-cta-ink)]">
              <Trophy size={52} strokeWidth={1.6} aria-hidden="true" />
            </span>
          </span>
        </div>

        <p aria-hidden="true" className="m-0 font-[family-name:var(--font-decorative)] text-[clamp(40px,6vw,60px)] leading-none text-[var(--gt-blue-500)]">
          {t("learning.bravo")}
        </p>
        <div className="grid gap-2">
          <h1 className="text-[clamp(28px,4vw,40px)]">{t("learning.completeTitle")}</h1>
          <p className="m-0 text-[length:var(--text-body-lg)] font-semibold text-[var(--text-primary)]">{pick(training.title, lang)}</p>
          <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[var(--text-muted)]">{t("learning.completeBody")}</p>
        </div>

        <dl className="m-0 grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [t("learning.stats.status"), t("learning.courseStatus.completed")],
            [t("learning.stats.date"), progress.completedOn ? formatDate(progress.completedOn) : "—"],
            [t("learning.stats.lessons"), `${summary.doneCount}/${summary.total}`],
            [t("learning.stats.average"), summary.quizAverage !== null ? `${summary.quizAverage}%` : "—"],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse gap-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3.5">
              <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{label}</dt>
              <dd className="m-0 text-[length:var(--text-body-md)] font-bold tabular-nums text-[var(--text-primary)]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("learning.stats.timeTotal", { time: formatDuration(summary.totalMinutes, lang) })}
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          {training.completion.certificate && (
            <Button variant="primary" size="lg" iconLeft={Award} onClick={() => navigate("/compte/attestations")}>
              {t("learning.certificateCta")}
            </Button>
          )}
          <Button variant={training.completion.certificate ? "dark" : "primary"} size="lg" iconLeft={LayoutDashboard} onClick={() => navigate("/compte")}>
            {t("learning.toDashboard")}
          </Button>
        </div>
        <Button variant="ghost" iconLeft={RotateCcw} onClick={() => navigate(learnHref(courseId))}>
          {t("learning.reviewCourse")}
        </Button>
        {!training.completion.certificate && <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("learning.criteriaNoCertificate")}</p>}
      </section>
    </div>
  );
}
