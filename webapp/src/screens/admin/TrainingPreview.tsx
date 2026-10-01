"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams, useSearchParams } from "../../lib/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  Eye,
  FileText,
  GraduationCap,
  ListChecks,
  RotateCcw,
  X,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { EmptyState } from "../../components/admin/EmptyState";
import { BlockView } from "../../components/admin/training/ContentBlocks";
import { QuizPlayer } from "../../components/learning/QuizPlayer";
import type { Quiz, TrainingCourse } from "../../data/adminTraining";
import { localGrader } from "../../lib/learning/grading";
import { MediaImage } from "../../components/admin/training/MediaImage";
import { useAdminTraining } from "../../lib/adminTraining";
import { useLocalized, type ContentLang } from "../../lib/localized";

/**
 * The course as a learner meets it.
 *
 * A real walk-through rather than a rendered page: the steps advance, the
 * progress bar moves, the knowledge check can be answered, marked and retried,
 * and the course can be finished. An administrator writing feedback for a wrong
 * answer needs to see that feedback appear where a learner will read it, which
 * a static mock-up cannot show.
 *
 * The preview banner is permanent and unmissable. Nothing here writes to the
 * course — this screen only reads it.
 */

type Node =
  | { kind: "step"; moduleId: string; stepId: string }
  | { kind: "quiz"; moduleId: string };

export function TrainingPreview() {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { getCourse, loading } = useAdminTraining();

  const course = getCourse(id);
  const lang: ContentLang = i18n.language.startsWith("en") ? "en" : "fr";

  /** The learner's path: every step of every module, each module's quiz last. */
  const nodes = useMemo<Node[]>(() => {
    if (!course) return [];
    return course.modules.flatMap((module) => [
      ...module.steps.map((step) => ({ kind: "step" as const, moduleId: module.id, stepId: step.id })),
      ...(module.quiz ? [{ kind: "quiz" as const, moduleId: module.id }] : []),
    ]);
  }, [course]);

  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);

  // The builder can open the preview on one step or module, which is what makes
  // "Preview this step" a preview of that step rather than of the course.
  const wantedModule = params.get("module");
  const wantedStep = params.get("etape");
  useEffect(() => {
    if (!wantedModule || nodes.length === 0) return;
    const index = nodes.findIndex((node) =>
      wantedStep
        ? node.kind === "step" && node.stepId === wantedStep
        : node.moduleId === wantedModule,
    );
    if (index >= 0) setCurrent(index);
  }, [wantedModule, wantedStep, nodes]);

  if (!course) {
    return loading ? <p className="m-0 p-8 text-center text-[var(--text-muted)]" role="status">{t("admin.training.builder.loading")}</p> : <Navigate to="/admin/formations" replace />;
  }

  const exit = () => navigate(`/admin/formations/${course.id}`);
  const nodeKey = (node: Node) => (node.kind === "step" ? node.stepId : `quiz-${node.moduleId}`);
  const node = nodes[current];
  const progress = nodes.length === 0 ? 0 : Math.round((done.size / nodes.length) * 100);

  const complete = (key: string) => setDone((prev) => new Set(prev).add(key));

  const goNext = () => {
    if (!node) return;
    complete(nodeKey(node));
    if (current < nodes.length - 1) setCurrent(current + 1);
    else setFinished(true);
  };

  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <PreviewBanner onExit={exit} />

      {nodes.length === 0 ? (
        <div className="mx-auto max-w-[720px] px-[var(--admin-gutter)] py-12">
          <div className="gt-admin-panel">
            <EmptyState
              icon={GraduationCap}
              title={t("admin.training.preview.emptyTitle")}
              body={t("admin.training.preview.emptyBody")}
              action={
                <AdminButton variant="primary" onClick={exit}>
                  {t("admin.training.preview.backToBuilder")}
                </AdminButton>
              }
            />
          </div>
        </div>
      ) : (
        <div className="mx-auto grid max-w-[1180px] gap-6 px-[var(--admin-gutter)] py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Contents
            course={course}
            nodes={nodes}
            current={current}
            done={done}
            progress={progress}
            onPick={(index) => {
              setFinished(false);
              setCurrent(index);
            }}
          />

          <main className="min-w-0">
            {finished ? (
              <CompletionCard course={course} onRestart={() => {
                setFinished(false);
                setCurrent(0);
                setDone(new Set());
              }} onExit={exit} />
            ) : (
              <NodeView
                course={course}
                node={node}
                lang={lang}
                onComplete={() => complete(nodeKey(node))}
              />
            )}

            {!finished && (
              <nav
                aria-label={t("admin.training.preview.contents")}
                className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4"
              >
                <AdminButton
                  variant="outline"
                  iconLeft={ArrowLeft}
                  disabled={current === 0}
                  onClick={() => setCurrent(current - 1)}
                >
                  {t("admin.training.preview.previous")}
                </AdminButton>

                <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
                  {current + 1} / {nodes.length}
                </span>

                <AdminButton variant="primary" iconRight={ArrowRight} onClick={goNext}>
                  {current === nodes.length - 1
                    ? t("admin.training.preview.done")
                    : t("admin.training.preview.next")}
                </AdminButton>
              </nav>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The preview banner.
 *
 * Sticky, high contrast and always carrying its way out. A preview an
 * administrator cannot tell apart from the real thing is how mock content ends
 * up being treated as published.
 */
function PreviewBanner({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-[80] border-b border-[var(--gt-ink-700)] bg-[var(--gt-ink-900)] text-[var(--text-inverse)]">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3 px-[var(--admin-gutter)] py-2.5">
        <span
          aria-hidden="true"
          className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[var(--accent-cta)] text-[var(--gt-ink-900)]"
        >
          <Eye size={14} strokeWidth={2.2} />
        </span>
        <span className="grid min-w-0 flex-1 leading-tight">
          <strong className="text-[length:var(--text-body-sm)] font-bold">
            {t("admin.training.preview.banner")}
          </strong>
          <span className="text-[length:var(--text-caption)] text-[rgba(250,250,248,.68)]">
            {t("admin.training.preview.bannerBody")}
          </span>
        </span>
        <AdminButton variant="primary" size="sm" iconLeft={X} onClick={onExit}>
          {t("admin.training.preview.exit")}
        </AdminButton>
      </div>
    </div>
  );
}

function Contents({
  course,
  nodes,
  current,
  done,
  progress,
  onPick,
}: {
  course: TrainingCourse;
  nodes: Node[];
  current: number;
  done: Set<string>;
  progress: number;
  onPick: (index: number) => void;
}) {
  const { t } = useTranslation();
  const L = useLocalized();

  return (
    <aside className="grid h-fit gap-4 lg:sticky lg:top-[84px]">
      <div className="gt-admin-panel overflow-hidden">
        <MediaImage mediaRef={course.cover} className="aspect-[16/9] w-full object-cover" />
        <div className="grid gap-2 p-4">
          <h1 className="text-[length:var(--text-h4)]">{L(course.title)}</h1>

          <div className="grid gap-1.5 pt-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                {t("admin.training.preview.progress", { done: done.size, total: nodes.length })}
              </span>
              <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
                {progress} %
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("admin.training.preview.progressLabel")}
              className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-sunken)]"
            >
              <span
                className="block h-full rounded-[var(--radius-pill)] bg-[var(--gt-emerald-400)] transition-[width] duration-[var(--duration-normal)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <nav aria-label={t("admin.training.preview.contents")} className="gt-admin-panel p-3">
        <p className="m-0 mb-2 px-1 text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
          {t("admin.training.preview.contents")}
        </p>
        <ol className="m-0 grid list-none gap-2 p-0">
          {course.modules.map((module, moduleIndex) => (
            <li key={module.id} className="grid gap-0.5">
              <p className="m-0 px-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                {String(moduleIndex + 1).padStart(2, "0")} · {L(module.title)}
              </p>
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {[...module.steps.map((s) => ({ kind: "step" as const, id: s.id, label: L(s.title) })),
                  ...(module.quiz ? [{ kind: "quiz" as const, id: `quiz-${module.id}`, label: L(module.quiz.title) }] : [])].map(
                  (entry) => {
                    const index = nodes.findIndex((n) =>
                      entry.kind === "step" ? n.kind === "step" && n.stepId === entry.id : n.kind === "quiz" && n.moduleId === module.id,
                    );
                    const isCurrent = index === current;
                    const isDone = done.has(entry.id);
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => onPick(index)}
                          aria-current={isCurrent ? "step" : undefined}
                          className={clsx(
                            "flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-2 py-1.5 text-left text-[length:var(--text-caption)] transition-colors",
                            "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]",
                            isCurrent
                              ? "bg-[var(--gt-ink-900)] font-semibold text-[var(--text-inverse)]"
                              : "text-[var(--text-body)] hover:bg-[var(--surface-sunken)]",
                          )}
                        >
                          {/* Completion is a tick and a word, never a colour on
                              its own. */}
                          <span
                            aria-hidden="true"
                            className={clsx(
                              "grid h-4 w-4 flex-none place-items-center rounded-full border",
                              isDone
                                ? "border-[var(--gt-emerald-500)] bg-[var(--gt-emerald-500)] text-[var(--gt-white)]"
                                : isCurrent
                                  ? "border-[rgba(250,250,248,.5)]"
                                  : "border-[var(--border-default)]",
                            )}
                          >
                            {isDone && <Check size={10} strokeWidth={3} />}
                          </span>
                          {entry.kind === "quiz" ? (
                            <ListChecks size={12} strokeWidth={2} aria-hidden="true" className="flex-none" />
                          ) : (
                            <FileText size={12} strokeWidth={2} aria-hidden="true" className="flex-none" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                          {isDone && <span className="sr-only">{t("admin.training.preview.done")}</span>}
                        </button>
                      </li>
                    );
                  },
                )}
              </ul>
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}

function NodeView({
  course,
  node,
  lang,
  onComplete,
}: {
  course: TrainingCourse;
  node: Node;
  lang: ContentLang;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const L = useLocalized();
  const module = course.modules.find((m) => m.id === node.moduleId);
  if (!module) return null;
  const moduleIndex = course.modules.findIndex((m) => m.id === module.id);

  const eyebrow = (
    <p className="m-0 text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
      {t("admin.training.preview.moduleOf", { current: moduleIndex + 1, total: course.modules.length })} ·{" "}
      {L(module.title)}
    </p>
  );

  if (node.kind === "quiz") {
    if (!module.quiz) return null;
    // The learner's own knowledge check, with attempts left uncounted: the
    // administrator sees exactly the questions, feedback and flow a learner
    // gets, and can retry as often as they like.
    return (
      <article className="grid gap-4">
        {eyebrow}
        <PreviewQuiz key={module.quiz.id} quiz={module.quiz} lang={lang} onPassed={onComplete} />
      </article>
    );
  }

  const step = module.steps.find((s) => s.id === node.stepId);
  if (!step) return null;
  const stepIndex = module.steps.findIndex((s) => s.id === step.id);

  return (
    <article className="gt-admin-panel grid gap-5 p-[clamp(20px,3vw,32px)]">
      {eyebrow}
      <header className="grid gap-1.5 border-b border-[var(--border-subtle)] pb-4">
        <h2 className="text-[length:var(--text-h2)]">
          <span className="mr-2 tabular-nums text-[var(--text-subtle)]">
            {String(stepIndex + 1).padStart(2, "0")}
          </span>
          {L(step.title)}
        </h2>
        {step.summary[lang] && (
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-muted)]">{step.summary[lang]}</p>
        )}
      </header>

      {step.blocks.length === 0 ? (
        <p className="m-0 rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)] p-4 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("admin.training.step.emptyTitle")}
        </p>
      ) : (
        <div className="grid gap-6">
          {step.blocks.map((block) => (
            <BlockView key={block.id} block={block} lang={lang} />
          ))}
        </div>
      )}
    </article>
  );
}

function CompletionCard({
  course,
  onRestart,
  onExit,
}: {
  course: TrainingCourse;
  onRestart: () => void;
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const L = useLocalized();

  return (
    <article className="gt-admin-panel grid justify-items-center gap-4 p-[clamp(28px,4vw,48px)] text-center">
      <span
        aria-hidden="true"
        className="gt-celebrate grid h-16 w-16 place-items-center rounded-full bg-[var(--gt-emerald-50)] text-[var(--accent-cta-ink)]"
      >
        <Award size={30} strokeWidth={1.8} />
      </span>
      <h2 className="text-[length:var(--text-h2)]">{t("admin.training.preview.completeTitle")}</h2>
      <p className="m-0 max-w-[48ch] text-[length:var(--text-body-md)] text-[var(--text-muted)]">
        {t("admin.training.preview.completeBody")}
      </p>
      <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
        {L(course.title)}
      </p>
      {course.completion.certificate && (
        <p className="m-0 rounded-[var(--radius-pill)] bg-[var(--gt-blue-50)] px-4 py-2 text-[length:var(--text-caption)] text-[var(--gt-blue-700)]">
          {t("admin.training.preview.completeCertificate")}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <AdminButton variant="outline" iconLeft={RotateCcw} onClick={onRestart}>
          {t("admin.training.preview.quizRetry")}
        </AdminButton>
        <AdminButton variant="primary" iconLeft={X} onClick={onExit}>
          {t("admin.training.preview.exit")}
        </AdminButton>
      </div>
    </article>
  );
}

/** The learner's check, graded in the browser: the preview holds the answer keys. */
function PreviewQuiz({ quiz, lang, onPassed }: { quiz: Quiz; lang: ContentLang; onPassed: () => void }) {
  const grader = useMemo(() => localGrader(quiz), [quiz]);
  return <QuizPlayer quiz={quiz} lang={lang} unlimited grader={grader} onSubmitted={(score) => score.passed && onPassed()} />;
}
