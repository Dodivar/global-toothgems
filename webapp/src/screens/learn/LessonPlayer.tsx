"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useParams } from "../../lib/navigation";
import { ArrowLeft, ArrowRight, Check, Clock, FileText, Flag, Image as ImageIcon, ListChecks, ListTree, Lock, PlayCircle, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { CourseOutline } from "../../components/learning/CourseOutline";
import { LessonBlocks } from "../../components/learning/LessonBlocks";
import { ProgressRing, ThinProgress } from "../../components/learning/LearningStatus";
import { QuizPlayer } from "../../components/learning/QuizPlayer";
import monogram from "../../assets/monogram-blue.png";
import type { TrainingCourse } from "../../data/adminTraining";
import { pick } from "../../data/types";
import { completionHref, learnHref, lessonHref } from "../../lib/academyUrl";
import { isNodeDone, isRequired, isUnlocked, type CourseSummary, type PathNode } from "../../lib/learning/path";
import type { ContentLang } from "../../lib/localized";
import { useCourseMediaUrl, useProgress } from "../../lib/progress";
import { useToast } from "../../lib/toast";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { formatDuration } from "../../lib/trainingFilters";
import { LearnAccessState } from "./LearnAccessState";
import { useLearnerCourse } from "./useLearnerCourse";

/**
 * The learning interface.
 *
 * A workspace of its own — no storefront header, no footer — with the lesson
 * in the main column and the course's contents beside it. On a phone the side
 * panel becomes a progress strip and a sheet, and the next action moves to a
 * bar under the thumb: the desktop sidebar is not squeezed onto a small screen.
 *
 * One primary action at a time, always named for where it leads: next lesson,
 * the knowledge check, next module, or completing the training. Validating a
 * step is that action — reading a lesson's URL never marks it done.
 */
export function LessonPlayer() {
  const { courseId = "", nodeKey = "" } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const contentLang: ContentLang = lang.startsWith("en") ? "en" : "fr";
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { visitNode, completeStep, quizGrader } = useProgress();
  const mediaUrl = useCourseMediaUrl();
  const { card, access, training, record, summary, progress } = useLearnerCourse(courseId);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justCompleted, setJustCompleted] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const index = summary ? summary.path.findIndex((n) => n.key === nodeKey) : -1;
  const node = summary && index >= 0 ? summary.path[index] : undefined;
  const unlocked = Boolean(node && training && record && summary && isUnlocked(index, summary.path, record, training));
  const nodeKind = node?.kind;
  // One grader per check on screen: it holds the attempt being answered.
  const grader = useMemo(
    () => (nodeKind === "quiz" ? quizGrader(courseId, nodeKey) : null),
    [courseId, nodeKey, nodeKind, quizGrader],
  );

  useEffect(() => {
    if (node && unlocked) visitNode(courseId, node.key);
  }, [courseId, node, unlocked, visitNode]);

  // A new lesson is a new page for assistive technology: move focus to its title.
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [nodeKey]);

  useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => setJustCompleted(null), 1800);
    return () => clearTimeout(timer);
  }, [justCompleted]);

  if (access.state !== "open" || !training || !record || !summary) {
    return (
      <div className="min-h-screen bg-[var(--surface-page)]">
        <PlayerBar courseId={courseId} title={card ? pick(card.title, lang) : ""} />
        <LearnAccessState access={access} courseId={courseId} />
      </div>
    );
  }
  if (!node) return <Navigate to={learnHref(courseId)} replace />;

  const module = training.modules[node.moduleIndex];
  const moduleCover = node.kind === "step" && node.indexInModule === 0 ? mediaUrl(module.cover) : "";
  const step = node.kind === "step" ? module.steps.find((s) => s.id === node.key) : undefined;
  const done = isNodeDone(node, record);
  const nextNode = summary.path[index + 1];
  const prevNode = summary.path[index - 1];
  const canAdvance = node.kind === "step" || done || !isRequired(node, training);

  const primaryLabel = !nextNode
    ? t("learning.nav.complete")
    : nextNode.kind === "quiz"
      ? t("learning.nav.toQuiz")
      : nextNode.moduleId !== node.moduleId
        ? t("learning.nav.nextModule")
        : t("learning.nav.nextLesson");

  const advance = async () => {
    if (saving) return;
    if (node.kind === "step" && !done) {
      // The server validates the step (and refuses a locked one); move on only once it is recorded.
      setSaving(true);
      const saved = await completeStep(courseId, node.key);
      setSaving(false);
      if (!saved) {
        showToast(t("learning.toast.saveFailedTitle"), t("learning.toast.saveFailedBody"), "error");
        return;
      }
      setJustCompleted(node.key);
      showToast(
        t("learning.toast.lessonDone"),
        nextNode ? t("learning.toast.upNext", { title: pick(nextNode.title, lang) }) : undefined,
      );
    }
    navigate(nextNode ? lessonHref(courseId, nextNode.key) : completionHref(courseId));
  };

  const goPrevious = () => prevNode && navigate(lessonHref(courseId, prevNode.key));

  const frontierNode = summary.path[summary.frontierIndex];

  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <PlayerBar
        courseId={courseId}
        title={pick(training.title, lang)}
        pct={summary.pct}
        doneCount={summary.doneCount}
        total={summary.total}
        onOpenContents={() => setSheetOpen(true)}
      />

      <div className="mx-auto grid max-w-[1360px] gap-8 px-[clamp(16px,3vw,40px)] pb-32 pt-5 lg:grid-cols-[minmax(0,1fr)_348px] lg:pb-16 lg:pt-8">
        <div className="min-w-0">
          <MobileProgress node={node} course={training} summary={summary} />

          <article className="mx-auto grid max-w-[820px] gap-7">
            <header className="grid gap-3">
              {moduleCover && (
                <img
                  src={moduleCover}
                  alt=""
                  aria-hidden="true"
                  className="mb-2 aspect-[21/9] w-full rounded-[var(--radius-card)] object-cover"
                />
              )}
              <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">
                <span>{t("learning.moduleNumber", { number: node.moduleIndex + 1 })}</span>
                <span aria-hidden="true">·</span>
                <span className="normal-case tracking-normal">{pick(module.title, lang)}</span>
              </p>
              <h1
                ref={heading}
                tabIndex={-1}
                className="text-[clamp(28px,3.6vw,40px)] leading-[var(--leading-snug)] tracking-[var(--tracking-tight)] outline-none"
              >
                {node.kind === "quiz" ? pick(node.title, lang) : pick(step?.title ?? node.title, lang)}
              </h1>
              {step?.summary[contentLang] && (
                <p className="m-0 max-w-[62ch] text-[length:var(--text-body-lg)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
                  {step.summary[contentLang]}
                </p>
              )}
              <LessonMeta node={node} blocks={step?.blocks ?? []} done={done} />
            </header>

            {!unlocked ? (
              <LockedLesson
                blocker={frontierNode ? pick(frontierNode.title, lang) : ""}
                onGo={() => frontierNode && navigate(lessonHref(courseId, frontierNode.key))}
              />
            ) : step ? (
              step.blocks.length === 0 ? (
                <p className="m-0 rounded-[var(--radius-card)] bg-[var(--surface-sunken)] p-5 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                  {t("learning.emptyLesson")}
                </p>
              ) : (
                <LessonBlocks blocks={step.blocks} lang={contentLang} />
              )
            ) : module.quiz && grader ? (
              <QuizPlayer
                key={node.key}
                quiz={module.quiz}
                lang={contentLang}
                result={record.quizResults[node.key]}
                grader={grader}
                onSubmitted={(score) => {
                  if (score.passed) {
                    setJustCompleted(node.key);
                    showToast(t("learning.toast.quizPassed"), t("learning.toast.quizPassedBody", { score: score.score }));
                  }
                }}
                continueAction={{ label: primaryLabel, onClick: advance }}
                reviewHref={module.steps[0] ? lessonHref(courseId, module.steps[0].id) : undefined}
              />
            ) : null}

            {unlocked && (
              <LessonNavigation
                nextNode={nextNode}
                course={training}
                primaryLabel={primaryLabel}
                canAdvance={canAdvance}
                hasPrevious={Boolean(prevNode)}
                onNext={advance}
                onPrevious={goPrevious}
              />
            )}
          </article>
        </div>

        <aside aria-label={t("learning.contents")} className="hidden lg:block">
          <div className="gt-admin-scroll sticky top-[88px] grid max-h-[calc(100vh-104px)] gap-4 overflow-y-auto pb-2 pr-1">
            <SidebarProgress summary={summary} node={node} course={training} completed={progress.completed} courseId={courseId} />
            <nav aria-label={t("learning.contents")} className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2 shadow-[var(--shadow-xs)]">
              <CourseOutline courseId={courseId} course={training} summary={summary} record={record} currentKey={node.key} justCompleted={justCompleted} />
            </nav>
          </div>
        </aside>
      </div>

      {unlocked && (
        <MobileActionBar
          primaryLabel={primaryLabel}
          canAdvance={canAdvance}
          hasPrevious={Boolean(prevNode)}
          onNext={advance}
          onPrevious={goPrevious}
          hideNext={node.kind === "quiz" && !done}
        />
      )}

      {sheetOpen && (
        <ContentsSheet onClose={() => setSheetOpen(false)} summary={summary}>
          <CourseOutline
            courseId={courseId}
            course={training}
            summary={summary}
            record={record}
            currentKey={node.key}
            justCompleted={justCompleted}
            onNavigate={() => setSheetOpen(false)}
          />
        </ContentsSheet>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** The workspace's own bar: the way back, the course, and where the learner stands. */
function PlayerBar({
  courseId,
  title,
  pct,
  doneCount,
  total,
  onOpenContents,
}: {
  courseId: string;
  title: string;
  pct?: number;
  doneCount?: number;
  total?: number;
  onOpenContents?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[rgba(255,255,255,.88)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center gap-3 px-[clamp(12px,3vw,40px)]">
        <Link
          to={learnHref(courseId)}
          className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-pill)] py-1 pr-3 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] hover:text-[var(--text-link-hover)]"
        >
          <ArrowLeft size={18} aria-hidden="true" className="flex-none" />
          <img src={monogram.src} alt="" aria-hidden="true" className="hidden h-7 w-7 flex-none object-contain sm:block" />
          <span className="sr-only sm:not-sr-only sm:truncate">{t("learning.backToOverview")}</span>
          <span className="sr-only">· {title}</span>
        </Link>
        <span aria-hidden="true" className="hidden h-6 w-px bg-[var(--border-subtle)] md:block" />
        <p className="m-0 hidden min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] md:block">{title}</p>
        <span className="flex-1 md:hidden" />
        {pct !== undefined && (
          <div className="flex items-center gap-2.5">
            <span className="hidden text-right text-[length:var(--text-caption)] leading-tight text-[var(--text-muted)] sm:grid">
              <strong className="text-[var(--text-primary)]">{t("learning.courseProgressShort")}</strong>
              <span className="tabular-nums">{t("learning.stats.lessonsValue", { done: doneCount, total })}</span>
            </span>
            <ProgressRing value={pct} size={42} stroke={4} label={t("learning.courseProgress")} />
          </div>
        )}
        {onOpenContents && (
          <button
            type="button"
            onClick={onOpenContents}
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-[var(--surface-card)] px-3.5 text-[length:var(--text-caption)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] hover:bg-[var(--gt-ink-100)] lg:hidden"
          >
            <ListTree size={16} aria-hidden="true" />
            {t("learning.contentsShort")}
          </button>
        )}
      </div>
    </header>
  );
}

function MobileProgress({ node, course, summary }: { node: PathNode; course: TrainingCourse; summary: CourseSummary }) {
  const { t } = useTranslation();
  const moduleSummary = summary.modules[node.moduleIndex];
  return (
    <div className="mb-5 grid gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between gap-3 text-[length:var(--text-caption)]">
        <span className="font-semibold text-[var(--text-primary)]">
          {t("learning.positionShort", {
            module: node.moduleIndex + 1,
            modules: course.modules.length,
            lesson: node.indexInModule + 1,
            lessons: node.moduleSize,
          })}
        </span>
        <span className="tabular-nums text-[var(--text-muted)]">
          {t("learning.moduleDone", { done: moduleSummary.done, total: moduleSummary.total })}
        </span>
      </div>
      <ThinProgress value={moduleSummary.total ? (moduleSummary.done / moduleSummary.total) * 100 : 0} label={t("learning.currentModuleProgress")} />
    </div>
  );
}

function SidebarProgress({
  summary,
  node,
  course,
  completed,
  courseId,
}: {
  summary: CourseSummary;
  node: PathNode;
  course: TrainingCourse;
  completed: boolean;
  courseId: string;
}) {
  const { t, i18n } = useTranslation();
  const moduleSummary = summary.modules[node.moduleIndex];
  return (
    <div className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-xs)]">
      <div className="flex items-center gap-4">
        <ProgressRing value={summary.pct} size={64} stroke={6} label={t("learning.courseProgress")} />
        <div className="grid gap-0.5 text-[length:var(--text-caption)]">
          <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
            {completed ? t("learning.courseStatus.completed") : t("learning.courseProgressShort")}
          </strong>
          <span className="text-[var(--text-body)]">{t("learning.stats.lessonsValue", { done: summary.doneCount, total: summary.total })}</span>
          <span className="flex items-center gap-1 text-[var(--text-muted)]">
            <Clock size={11} aria-hidden="true" />
            {t("learning.stats.timeLeft", { time: formatDuration(summary.remainingMinutes, i18n.language) })}
          </span>
        </div>
      </div>
      <div className="grid gap-1.5 border-t border-[var(--border-subtle)] pt-3">
        <div className="flex items-baseline justify-between gap-2 text-[length:var(--text-caption)]">
          <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]">
            {t("learning.moduleNumber", { number: node.moduleIndex + 1 })} · {pick(course.modules[node.moduleIndex].title, i18n.language)}
          </span>
          <span className="flex-none tabular-nums text-[var(--text-muted)]">
            {moduleSummary.done}/{moduleSummary.total}
          </span>
        </div>
        <ThinProgress value={moduleSummary.total ? (moduleSummary.done / moduleSummary.total) * 100 : 0} label={t("learning.currentModuleProgress")} />
      </div>
      {completed && (
        <Link to={completionHref(courseId)} className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold text-[var(--accent-cta-ink)] underline decoration-1 underline-offset-4">
          <Flag size={13} aria-hidden="true" />
          {t("learning.seeCompletion")}
        </Link>
      )}
    </div>
  );
}

function LessonMeta({ node, blocks, done }: { node: PathNode; blocks: { type: string }[]; done: boolean }) {
  const { t } = useTranslation();
  const count = (type: string) => blocks.filter((b) => b.type === type).length;
  const kinds = [
    { type: "text", icon: FileText },
    { type: "image", icon: ImageIcon },
    { type: "video", icon: PlayCircle },
  ].filter((k) => count(k.type) > 0);
  return (
    <ul className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
      {done && (
        <li>
          <Badge tone="success" size="sm" icon={Check}>
            {t("learning.nodeStatus.done")}
          </Badge>
        </li>
      )}
      <li className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-card)] px-2.5 py-1 text-[length:var(--text-caption)] font-medium text-[var(--text-body)] shadow-[var(--shadow-inset-hairline)]">
        <Clock size={12} aria-hidden="true" />
        {t("learning.minutes", { minutes: node.minutes })}
      </li>
      {node.kind === "quiz" ? (
        <li className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-card)] px-2.5 py-1 text-[length:var(--text-caption)] font-medium text-[var(--text-body)] shadow-[var(--shadow-inset-hairline)]">
          <ListChecks size={12} aria-hidden="true" />
          {t("learning.knowledgeCheck")}
        </li>
      ) : (
        kinds.map(({ type, icon: Icon }) => (
          <li
            key={type}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-card)] px-2.5 py-1 text-[length:var(--text-caption)] font-medium text-[var(--text-body)] shadow-[var(--shadow-inset-hairline)]"
          >
            <Icon size={12} aria-hidden="true" />
            {t(`learning.blockCount.${type}`, { count: count(type) })}
          </li>
        ))
      )}
    </ul>
  );
}

function LockedLesson({ blocker, onGo }: { blocker: string; onGo: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid justify-items-start gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] p-6">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-muted)]">
        <Lock size={20} aria-hidden="true" />
      </span>
      <h2 className="text-[length:var(--text-h4)]">{t("learning.lockedTitle")}</h2>
      <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("learning.lockedBody", { title: blocker })}</p>
      <Button variant="dark" iconRight={ArrowRight} onClick={onGo}>
        {t("learning.lockedCta")}
      </Button>
    </div>
  );
}

function LessonNavigation({
  nextNode,
  course,
  primaryLabel,
  canAdvance,
  hasPrevious,
  onNext,
  onPrevious,
}: {
  nextNode: PathNode | undefined;
  course: TrainingCourse;
  primaryLabel: string;
  canAdvance: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <nav aria-label={t("learning.nav.label")} className="mt-4 grid gap-4 border-t border-[var(--border-subtle)] pt-6">
      {nextNode && (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash-strong)] px-4 py-3">
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--surface-card)] text-[var(--gt-blue-700)]">
            {nextNode.kind === "quiz" ? <ListChecks size={16} aria-hidden="true" /> : <PlayCircle size={16} aria-hidden="true" />}
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-muted)]">{t("learning.upNext")}</span>
            <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">{pick(nextNode.title, lang)}</span>
            <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {pick(course.modules[nextNode.moduleIndex].title, lang)} ·{" "}
              {nextNode.kind === "quiz" ? t("learning.quizMinutes", { minutes: nextNode.minutes }) : t("learning.minutes", { minutes: nextNode.minutes })}
            </span>
          </span>
        </div>
      )}
      <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
        <Button variant="ghost" iconLeft={ArrowLeft} disabled={!hasPrevious} onClick={onPrevious}>
          {t("learning.nav.previous")}
        </Button>
        <Button variant="primary" size="lg" iconRight={nextNode ? ArrowRight : Flag} disabled={!canAdvance} onClick={onNext}>
          {primaryLabel}
        </Button>
      </div>
      {!canAdvance && (
        <p className="m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)] lg:justify-end">
          <Lock size={12} aria-hidden="true" />
          {t("learning.nav.passToContinue")}
        </p>
      )}
    </nav>
  );
}

/** The phone's action bar: previous as an icon, the next step as a wide button under the thumb. */
function MobileActionBar({
  primaryLabel,
  canAdvance,
  hasPrevious,
  onNext,
  onPrevious,
  hideNext,
}: {
  primaryLabel: string;
  canAdvance: boolean;
  hasPrevious: boolean;
  onNext: () => void;
  onPrevious: () => void;
  /** During an unpassed check the check's own buttons are the actions. */
  hideNext: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="gt-learn-actionbar fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-subtle)] bg-[rgba(255,255,255,.94)] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-[640px] items-center gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!hasPrevious}
          aria-label={t("learning.nav.previous")}
          className="grid h-12 w-12 flex-none place-items-center rounded-full border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] disabled:opacity-40"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        {hideNext ? (
          <p className="m-0 flex-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("learning.nav.passToContinue")}</p>
        ) : (
          <Button variant="primary" fullWidth disabled={!canAdvance} iconRight={ArrowRight} onClick={onNext} className="h-12 min-w-0 flex-1">
            <span className="truncate">{primaryLabel}</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function ContentsSheet({ onClose, summary, children }: { onClose: () => void; summary: CourseSummary; children: React.ReactNode }) {
  const { t } = useTranslation();
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div className="fixed inset-0 z-[300] lg:hidden">
      <div aria-hidden="true" onClick={onClose} className="gt-admin-scrim absolute inset-0 bg-[rgba(17,17,17,.42)]" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t("learning.contents")}
        tabIndex={-1}
        className="gt-learn-sheet absolute inset-x-0 bottom-0 grid max-h-[88vh] grid-rows-[auto_minmax(0,1fr)] rounded-t-[var(--radius-xl)] bg-[var(--surface-card)] shadow-[var(--shadow-lg)]"
      >
        <header className="grid gap-3 border-b border-[var(--border-subtle)] px-5 pb-4 pt-3">
          <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-[var(--gt-ink-300)]" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[length:var(--text-h4)]">{t("learning.contents")}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("learning.close")}
              className="grid h-10 w-10 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)]"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-1.5">
            <div className="flex justify-between text-[length:var(--text-caption)] text-[var(--text-muted)]">
              <span>{t("learning.stats.lessonsValue", { done: summary.doneCount, total: summary.total })}</span>
              <span className="font-semibold tabular-nums text-[var(--text-primary)]">{summary.pct}%</span>
            </div>
            <ThinProgress value={summary.pct} label={t("learning.courseProgress")} />
          </div>
        </header>
        <div className={clsx("overflow-y-auto overscroll-contain p-2 pb-[calc(16px+env(safe-area-inset-bottom))]")}>{children}</div>
      </div>
    </div>
  );
}
