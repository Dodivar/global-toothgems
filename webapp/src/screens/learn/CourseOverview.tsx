import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "../../lib/navigation";
import {
  ArrowRight,
  Award,
  BookOpen,
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  GraduationCap,
  ListChecks,
  RotateCcw,
  Target,
  Trophy,
} from "lucide-react";
import clsx from "clsx";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { ModuleStatusBadge, NodeMarker, ProgressRing, ThinProgress, type NodeStatus } from "../../components/learning/LearningStatus";
import { getInstructor, type TrainingCourse } from "../../data/adminTraining";
import { pick } from "../../data/types";
import { completionHref, lessonHref } from "../../lib/academyUrl";
import { formatDate } from "../../lib/format";
import { isNodeDone, isUnlocked, type CourseSummary, type LearnerRecord } from "../../lib/learning/path";
import { formatDuration } from "../../lib/trainingFilters";
import { ReviewRequestCard } from "../../components/reviews/ReviewRequestCard";
import { useReviewRequests } from "../../lib/reviews";
import { LearnAccessState } from "./LearnAccessState";
import { useLearnerCourse } from "./useLearnerCourse";

/**
 * The course overview: the learner's home for one training.
 *
 * It answers four questions in the order they are asked — where am I, what
 * have I done, what should I do next, how far is the end — and makes the next
 * action the loudest thing on the screen. Everything shown is derived from the
 * course as authored in the back office and from the learner's own record.
 */
export function CourseOverview() {
  const { courseId = "" } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { product, access, training, record, summary, progress } = useLearnerCourse(courseId);
  // Halfway through (or finished), the course can be reviewed: asked once,
  // quietly, beside the progress rather than inside a lesson.
  const reviewRequest = useReviewRequests().find((r) => r.subject.kind === "course" && r.subject.id === courseId);

  if (!product || !access || access.state !== "open" || !training || !record || !summary) {
    return <LearnAccessState access={access} courseId={courseId} />;
  }

  const instructor = getInstructor(training.instructorId);
  const next = summary.path[summary.nextIndex];
  const started = summary.doneCount > 0;
  const completed = progress.completed;
  const nextModule = next ? training.modules[next.moduleIndex] : undefined;

  return (
    <div className="mx-auto grid max-w-[var(--max-width-content)] gap-[clamp(28px,4vw,48px)] px-[clamp(16px,4vw,48px)] py-[clamp(20px,3vw,40px)]">
      <nav aria-label={t("learning.breadcrumb")} className="flex flex-wrap items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        <Link to="/compte" className="underline decoration-1 underline-offset-2 hover:text-[var(--text-primary)]">
          {t("learning.myAccount")}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="text-[var(--text-primary)]">
          {pick(training.title, lang)}
        </span>
      </nav>

      {/* Hero: identity on the left, the next action on the right. */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-stretch">
        <div className="relative isolate overflow-hidden rounded-[var(--radius-xl)] bg-[var(--gt-ink-900)] text-[var(--text-inverse)]">
          <img src={training.cover} alt="" aria-hidden="true" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-55" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[rgba(17,17,17,.92)] via-[rgba(17,17,17,.5)] to-[rgba(17,17,17,.1)]" />
          <div className="grid min-h-[340px] content-end gap-4 p-[clamp(20px,3.5vw,40px)]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={completed ? "success" : started ? "brand" : "neutral"} size="sm" icon={completed ? Check : started ? BookOpen : GraduationCap}>
                {completed ? t("learning.courseStatus.completed") : started ? t("learning.courseStatus.inProgress") : t("learning.courseStatus.notStarted")}
              </Badge>
              <span className="text-[length:var(--text-caption)] font-semibold text-[rgba(250,250,248,.8)]">
                {t(`admin.training.level.${training.level}`)} · {formatDuration(summary.totalMinutes, lang)}
              </span>
            </div>
            <h1 className="max-w-[18ch] text-[clamp(30px,4.2vw,48px)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--gt-off-white)]">
              {pick(training.title, lang)}
            </h1>
            <p className="m-0 max-w-[52ch] text-[length:var(--text-body-md)] text-[rgba(250,250,248,.82)]">{pick(training.shortDescription, lang)}</p>
            {instructor && (
              <div className="flex items-center gap-3 pt-1">
                <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-[var(--gt-blue-300)] text-[length:var(--text-caption)] font-bold text-[var(--gt-ink-900)]">
                  {instructor.initials}
                </span>
                <span className="grid leading-tight">
                  <span className="text-[length:var(--text-body-sm)] font-semibold">{instructor.name}</span>
                  <span className="text-[length:var(--text-caption)] text-[rgba(250,250,248,.7)]">{pick(instructor.role, lang)}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid content-start gap-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[clamp(20px,3vw,32px)] shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-5">
            <ProgressRing value={summary.pct} size={96} stroke={9} label={t("learning.courseProgress")} />
            <dl className="m-0 grid gap-1.5 text-[length:var(--text-body-sm)]">
              <div className="flex gap-1.5">
                <dt className="sr-only">{t("learning.stats.lessons")}</dt>
                <dd className="m-0 font-semibold text-[var(--text-primary)]">
                  {t("learning.stats.lessonsValue", { done: summary.doneCount, total: summary.total })}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="sr-only">{t("learning.stats.modules")}</dt>
                <dd className="m-0 text-[var(--text-body)]">
                  {t("learning.stats.modulesValue", { count: summary.modulesDone, total: summary.modules.length })}
                </dd>
              </div>
              <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <Clock size={13} aria-hidden="true" />
                <dt className="sr-only">{t("learning.stats.time")}</dt>
                <dd className="m-0">
                  {completed
                    ? t("learning.stats.timeTotal", { time: formatDuration(summary.totalMinutes, lang) })
                    : t("learning.stats.timeLeft", { time: formatDuration(summary.remainingMinutes, lang) })}
                </dd>
              </div>
            </dl>
          </div>

          {completed ? (
            <div className="grid gap-4">
              <div className="flex items-start gap-3 rounded-[var(--radius-lg)] bg-[var(--status-success-bg)] p-4">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--gt-emerald-500)] text-[var(--gt-white)]">
                  <Trophy size={20} aria-hidden="true" />
                </span>
                <span className="grid gap-0.5">
                  <strong className="text-[length:var(--text-body-md)] text-[var(--text-primary)]">{t("learning.completedTitle")}</strong>
                  <span className="text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                    {progress.completedOn ? t("learning.completedOn", { date: formatDate(progress.completedOn) }) : t("learning.completedBody")}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-3">
                {training.completion.certificate && (
                  <Button variant="primary" iconLeft={Award} onClick={() => navigate("/compte/attestations")}>
                    {t("learning.certificateCta")}
                  </Button>
                )}
                <Button variant="outline" iconLeft={RotateCcw} onClick={() => navigate(lessonHref(courseId, summary.path[0].key))}>
                  {t("learning.reviewCourse")}
                </Button>
              </div>
              <Link to={completionHref(courseId)} className="justify-self-start text-[length:var(--text-caption)] font-semibold underline decoration-1 underline-offset-4">
                {t("learning.seeCompletion")}
              </Link>
            </div>
          ) : next ? (
            <div className="grid gap-4">
              <div className="grid gap-1 rounded-[var(--radius-lg)] bg-[var(--surface-brand-wash)] p-4">
                <span className="gt-eyebrow">{started ? t("learning.upNext") : t("learning.startWith")}</span>
                <strong className="text-[length:var(--text-h4)] leading-[var(--leading-snug)] text-[var(--text-primary)]">{pick(next.title, lang)}</strong>
                <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  {t("learning.moduleNumber", { number: next.moduleIndex + 1 })} · {nextModule && pick(nextModule.title, lang)} ·{" "}
                  {next.kind === "quiz" ? t("learning.quizMinutes", { minutes: next.minutes }) : t("learning.minutes", { minutes: next.minutes })}
                </span>
              </div>
              <Button variant="primary" size="lg" fullWidth iconRight={ArrowRight} onClick={() => navigate(lessonHref(courseId, next.key))}>
                {started ? t("learning.continue") : t("learning.start")}
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="modules-title" className="grid content-start gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="modules-title" className="text-[length:var(--text-h3)]">
              {t("learning.modulesTitle")}
            </h2>
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("learning.stats.modulesValue", { count: summary.modulesDone, total: summary.modules.length })}
            </span>
          </div>
          <ol className="m-0 grid list-none gap-3 p-0">
            {training.modules.map((module, index) => (
              <ModuleCard
                key={module.id}
                courseId={courseId}
                course={training}
                moduleIndex={index}
                summary={summary}
                record={record}
                defaultOpen={next?.moduleId === module.id && !completed}
              />
            ))}
          </ol>
        </section>

        <aside className="grid content-start gap-4">
          <RecentlyCompleted courseId={courseId} summary={summary} record={record} />
          {reviewRequest && <ReviewRequestCard request={reviewRequest} variant="compact" />}
          {training.objectives.length > 0 && (
            <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
              <h2 className="flex items-center gap-2 text-[length:var(--text-h4)]">
                <Target size={17} aria-hidden="true" className="text-[var(--accent-highlight)]" />
                {t("learning.objectivesTitle")}
              </h2>
              <ul className="m-0 grid list-none gap-2 p-0">
                {training.objectives.map((objective) => (
                  <li key={objective.fr} className="flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                    <CircleCheck size={15} aria-hidden="true" className="mt-0.5 flex-none text-[var(--accent-cta-ink)]" />
                    {pick(objective, lang)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-2 rounded-[var(--radius-card)] bg-[var(--surface-brand-wash-strong)] p-5 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
            <h2 className="flex items-center gap-2 text-[length:var(--text-h4)]">
              <Award size={17} aria-hidden="true" className="text-[var(--gt-blue-700)]" />
              {t("learning.criteriaTitle")}
            </h2>
            <p className="m-0">{t("learning.criteriaBody", { score: training.completion.minScore })}</p>
            {progress.quizAverage !== null && (
              <p className="m-0 font-semibold text-[var(--text-primary)]">{t("learning.criteriaAverage", { score: progress.quizAverage })}</p>
            )}
            <p className="m-0 text-[var(--text-muted)]">
              {training.completion.certificate ? t("learning.criteriaCertificate") : t("learning.criteriaNoCertificate")}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ModuleCard({
  courseId,
  course,
  moduleIndex,
  summary,
  record,
  defaultOpen,
}: {
  courseId: string;
  course: TrainingCourse;
  moduleIndex: number;
  summary: CourseSummary;
  record: LearnerRecord;
  defaultOpen: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const module = course.modules[moduleIndex];
  const moduleSummary = summary.modules[moduleIndex];
  const [open, setOpen] = useState(defaultOpen);
  const nodes = summary.path.map((node, index) => ({ node, index })).filter(({ node }) => node.moduleId === module.id);
  const panelId = `module-${module.id}`;
  const isNext = summary.path[summary.nextIndex]?.moduleId === module.id && moduleSummary.status !== "completed";

  return (
    <li
      className={clsx(
        "overflow-hidden rounded-[var(--radius-card)] border bg-[var(--surface-card)] shadow-[var(--shadow-xs)] transition-shadow",
        isNext ? "border-[var(--gt-blue-300)] shadow-[var(--shadow-sm)]" : "border-[var(--border-subtle)]",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="grid w-full grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-4 p-4 text-left transition-colors hover:bg-[var(--gt-blue-50)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:grid-cols-[112px_minmax(0,1fr)_auto]"
      >
        <span className="relative block aspect-square overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)] sm:aspect-[4/3]">
          <img src={module.cover} alt="" aria-hidden="true" loading="lazy" className={clsx("h-full w-full object-cover", moduleSummary.status === "locked" && "opacity-60 grayscale")} />
          <span className="absolute left-1.5 top-1.5 rounded-[var(--radius-pill)] bg-[rgba(17,17,17,.72)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--gt-white)]">
            {String(moduleIndex + 1).padStart(2, "0")}
          </span>
        </span>
        <span className="grid min-w-0 gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <ModuleStatusBadge status={moduleSummary.status} />
            {isNext && <span className="text-[length:var(--text-caption)] font-semibold text-[var(--accent-cta-ink)]">{t("learning.upNext")}</span>}
          </span>
          <span className="text-[length:var(--text-body-md)] font-bold leading-[var(--leading-snug)] text-[var(--text-primary)]">{pick(module.title, lang)}</span>
          {pick(module.description, lang) && (
            <span className="line-clamp-2 text-[length:var(--text-caption)] text-[var(--text-muted)] max-sm:hidden">{pick(module.description, lang)}</span>
          )}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <span>{t("learning.lessonCount", { count: module.steps.length })}</span>
            {module.quiz && (
              <span className="inline-flex items-center gap-1">
                <ListChecks size={12} aria-hidden="true" />
                {t("learning.hasQuiz")}
              </span>
            )}
            <span>{formatDuration(moduleSummary.minutes, lang)}</span>
          </span>
          <ThinProgress
            value={moduleSummary.total ? (moduleSummary.done / moduleSummary.total) * 100 : 0}
            label={t("learning.moduleProgress", { title: pick(module.title, lang) })}
            className="max-w-[320px]"
          />
        </span>
        <ChevronDown size={18} aria-hidden="true" className={clsx("text-[var(--text-muted)] transition-transform duration-[var(--duration-fast)]", open && "rotate-180")} />
      </button>

      {open && (
        <ul id={panelId} className="m-0 grid list-none gap-1 border-t border-[var(--border-subtle)] p-2 sm:p-3">
          {nodes.map(({ node, index }) => {
            const done = isNodeDone(node, record);
            const unlocked = isUnlocked(index, summary.path, record, course);
            const status: NodeStatus = done ? "done" : index === summary.nextIndex ? "current" : unlocked ? "open" : "locked";
            const inner = (
              <>
                <NodeMarker status={status} kind={node.kind} number={node.indexInModule + 1} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className={clsx("text-[length:var(--text-body-sm)] font-semibold", unlocked ? "text-[var(--text-primary)]" : "text-[var(--text-subtle)]")}>
                    {pick(node.title, lang)}
                  </span>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {t(`learning.nodeStatus.${status === "current" ? "next" : status}`)} ·{" "}
                    {node.kind === "quiz" ? t("learning.quizMinutes", { minutes: node.minutes }) : t("learning.minutes", { minutes: node.minutes })}
                  </span>
                </span>
                {unlocked && <ArrowRight size={15} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />}
              </>
            );
            return (
              <li key={node.key}>
                {unlocked ? (
                  <Link
                    to={lessonHref(courseId, node.key)}
                    className="flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2.5 transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-2.5 py-2.5" title={t("learning.lockedHint")}>
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function RecentlyCompleted({ courseId, summary, record }: { courseId: string; summary: CourseSummary; record: LearnerRecord }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const items = record.history
    .map((event) => ({ event, node: summary.path.find((n) => n.key === event.key) }))
    .filter((item): item is { event: typeof item.event; node: NonNullable<typeof item.node> } => Boolean(item.node))
    .slice(0, 3);

  return (
    <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5">
      <h2 className="text-[length:var(--text-h4)]">{t("learning.recentTitle")}</h2>
      {items.length === 0 ? (
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("learning.recentEmpty")}</p>
      ) : (
        <ul className="m-0 grid list-none gap-1 p-0">
          {items.map(({ event, node }) => (
            <li key={event.key}>
              <Link
                to={lessonHref(courseId, node.key)}
                className="flex items-center gap-3 rounded-[var(--radius-sm)] px-1.5 py-2 hover:bg-[var(--surface-sunken)]"
              >
                <NodeMarker status="done" kind={node.kind} number={0} size="sm" />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{pick(node.title, lang)}</span>
                  <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {t("learning.completedAt", { date: formatDate(event.at.slice(0, 10)) })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
