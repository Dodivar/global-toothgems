import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  CircleCheck,
  CircleX,
  Eye,
  FileText,
  GraduationCap,
  Lightbulb,
  ListChecks,
  RotateCcw,
  X,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../../components/admin/AdminButton";
import { EmptyState } from "../../components/admin/EmptyState";
import { BlockView } from "../../components/admin/training/ContentBlocks";
import { getInstructor, type Question, type Quiz, type TrainingCourse } from "../../data/adminTraining";
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
  const { getCourse } = useAdminTraining();

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

  if (!course) return <Navigate to="/admin/formations" replace />;

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
  const instructor = getInstructor(course.instructorId);

  return (
    <aside className="grid h-fit gap-4 lg:sticky lg:top-[84px]">
      <div className="gt-admin-panel overflow-hidden">
        <img src={course.cover} alt="" aria-hidden="true" className="aspect-[16/9] w-full object-cover" />
        <div className="grid gap-2 p-4">
          <h1 className="text-[length:var(--text-h4)]">{L(course.title)}</h1>
          {instructor && (
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("admin.training.preview.by", { name: instructor.name })}
            </p>
          )}

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
    return (
      <article className="gt-admin-panel grid gap-5 p-[clamp(20px,3vw,32px)]">
        {eyebrow}
        <QuizRunner quiz={module.quiz} lang={lang} onPassed={onComplete} />
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

/* -------------------------------------------------------------------------- */
/* Knowledge check                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A working knowledge check.
 *
 * Answers can be chosen, the check submitted, the score read and — when the
 * settings allow it — the whole thing retried. Feedback appears immediately or
 * on submission depending on the quiz's own setting, so an administrator can
 * see what that toggle actually does rather than trusting its label.
 */
function QuizRunner({ quiz, lang, onPassed }: { quiz: Quiz; lang: ContentLang; onPassed: () => void }) {
  const { t } = useTranslation();
  const L = useLocalized();
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(1);

  // Shuffling is per attempt, not per render: re-ordering the answers under the
  // learner's cursor on every keystroke would be its own kind of broken.
  const order = useMemo(() => {
    const map: Record<string, Question["answers"]> = {};
    for (const question of quiz.questions) {
      map[question.id] = quiz.settings.shuffleAnswers
        ? [...question.answers].sort(() => Math.random() - 0.5)
        : question.answers;
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.id, quiz.settings.shuffleAnswers, attempt, quiz.questions.length]);

  if (quiz.questions.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title={t("admin.training.quiz.emptyTitle")}
        body={t("admin.training.quiz.emptyBody")}
      />
    );
  }

  const correctCount = quiz.questions.filter((q) => {
    const answerId = chosen[q.id];
    return answerId && q.answers.find((a) => a.id === answerId)?.correct;
  }).length;
  const score = Math.round((correctCount / quiz.questions.length) * 100);
  const passed = score >= quiz.settings.passingScore;
  const answeredAll = quiz.questions.every((q) => chosen[q.id]);

  const retry = () => {
    setChosen({});
    setSubmitted(false);
    setAttempt((a) => a + 1);
  };

  return (
    <div className="grid gap-5">
      <header className="grid gap-1.5 border-b border-[var(--border-subtle)] pb-4">
        <h2 className="flex items-center gap-2 text-[length:var(--text-h2)]">
          <ListChecks size={22} strokeWidth={2} aria-hidden="true" className="text-[var(--accent-cta-ink)]" />
          {L(quiz.title)}
        </h2>
        {quiz.intro[lang] && (
          <p className="m-0 text-[length:var(--text-body-md)] text-[var(--text-muted)]">{quiz.intro[lang]}</p>
        )}
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
          {t("admin.training.quiz.count", { count: quiz.questions.length })} ·{" "}
          {t("admin.training.quiz.passingScore")} {quiz.settings.passingScore} %
        </p>
      </header>

      <ol className="m-0 grid list-none gap-5 p-0">
        {quiz.questions.map((question, index) => {
          const answerId = chosen[question.id];
          const answer = question.answers.find((a) => a.id === answerId);
          const reveal = submitted || (quiz.settings.immediateFeedback && Boolean(answerId));

          return (
            <li key={question.id} className="grid gap-3">
              <p className="m-0 text-[length:var(--text-body-md)] font-semibold text-[var(--text-primary)]">
                <span className="mr-2 text-[length:var(--text-caption)] tabular-nums text-[var(--text-subtle)]">
                  {t("admin.training.preview.quizQuestionOf", {
                    current: index + 1,
                    total: quiz.questions.length,
                  })}
                </span>
                <br />
                {question.text[lang]}
              </p>

              {question.image && (
                <img
                  src={question.image}
                  alt=""
                  aria-hidden="true"
                  className="max-w-[420px] rounded-[var(--radius-media)] border border-[var(--border-subtle)]"
                />
              )}

              <fieldset className="m-0 grid gap-2 border-0 p-0">
                <legend className="sr-only">{question.text[lang] || t("admin.training.preview.chooseAnswer")}</legend>
                {order[question.id].map((option) => {
                  const selected = answerId === option.id;
                  // After submission the correct answer is shown when the quiz
                  // is set to reveal it; before that, only the learner's own
                  // choice is marked.
                  const showAsCorrect = reveal && option.correct && (quiz.settings.showAnswers || selected);
                  const showAsWrong = reveal && selected && !option.correct;

                  return (
                    <label
                      key={option.id}
                      className={clsx(
                        "flex cursor-pointer items-start gap-3 rounded-[var(--admin-radius-sm)] border p-3 transition-colors",
                        "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus-ring)]",
                        showAsCorrect
                          ? "border-[var(--gt-emerald-500)] bg-[var(--gt-emerald-50)]"
                          : showAsWrong
                            ? "border-[var(--gt-red-400)] bg-[var(--status-error-bg)]"
                            : selected
                              ? "border-[var(--gt-ink-900)] bg-[var(--surface-sunken)]"
                              : "border-[var(--border-subtle)] hover:border-[var(--gt-ink-400)]",
                      )}
                    >
                      <input
                        type="radio"
                        name={`preview-${question.id}-${attempt}`}
                        checked={selected}
                        disabled={submitted}
                        onChange={() => setChosen((prev) => ({ ...prev, [question.id]: option.id }))}
                        className="mt-0.5 h-4 w-4 flex-none accent-[var(--gt-ink-900)]"
                      />
                      <span className="min-w-0 flex-1 text-[length:var(--text-body-sm)] text-[var(--text-body)]">
                        {option.text[lang]}
                        {option.explanation?.[lang] && reveal && selected && (
                          <span className="mt-1 block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                            {option.explanation[lang]}
                          </span>
                        )}
                      </span>
                      {/* A word beside the icon: right and wrong must not be
                          carried by green and red alone. */}
                      {showAsCorrect && (
                        <span className="flex flex-none items-center gap-1 text-[length:var(--text-caption)] font-semibold text-[var(--status-success-fg)]">
                          <CircleCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                          {t("admin.training.preview.correctTitle")}
                        </span>
                      )}
                      {showAsWrong && (
                        <span className="flex flex-none items-center gap-1 text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
                          <CircleX size={14} strokeWidth={2.2} aria-hidden="true" />
                          {t("admin.training.preview.incorrectTitle")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </fieldset>

              {reveal && answer && (
                <div
                  className={clsx(
                    "grid gap-1.5 rounded-[var(--admin-radius-sm)] p-3 text-[length:var(--text-body-sm)]",
                    answer.correct
                      ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                      : "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
                  )}
                >
                  <strong className="flex items-center gap-1.5">
                    {answer.correct ? (
                      <CircleCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                    ) : (
                      <CircleX size={14} strokeWidth={2.2} aria-hidden="true" />
                    )}
                    {answer.correct
                      ? t("admin.training.preview.correctTitle")
                      : t("admin.training.preview.incorrectTitle")}
                  </strong>
                  <span>{answer.correct ? question.correctFeedback[lang] : question.incorrectFeedback[lang]}</span>
                  {question.learnMore?.[lang] && (
                    <span className="flex items-start gap-1.5 border-t border-current/20 pt-1.5 opacity-90">
                      <Lightbulb size={13} strokeWidth={2} aria-hidden="true" className="mt-0.5 flex-none" />
                      <span>
                        <strong>{t("admin.training.preview.goFurther")} — </strong>
                        {question.learnMore[lang]}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4">
        {submitted ? (
          <div
            role="status"
            className={clsx(
              "grid gap-1.5 rounded-[var(--admin-radius-sm)] p-4",
              passed
                ? "bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                : "bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]",
            )}
          >
            <strong className="flex items-center gap-2 text-[length:var(--text-body-md)]">
              {passed ? (
                <CircleCheck size={18} strokeWidth={2.2} aria-hidden="true" />
              ) : (
                <RotateCcw size={18} strokeWidth={2.2} aria-hidden="true" />
              )}
              {passed ? t("admin.training.preview.quizPassed") : t("admin.training.preview.quizFailed")}
            </strong>
            <span className="text-[length:var(--text-body-sm)]">
              {t("admin.training.preview.quizScore", { score })} ({correctCount}/{quiz.questions.length})
            </span>
            {!passed && quiz.settings.allowRetry && (
              <span className="text-[length:var(--text-body-sm)]">{t("admin.training.preview.quizFailedBody")}</span>
            )}
            {submitted && quiz.settings.showAnswers && (
              <span className="text-[length:var(--text-caption)] opacity-90">
                {t("admin.training.preview.answersRevealed")}
              </span>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {!submitted ? (
            <AdminButton
              variant="primary"
              iconLeft={ListChecks}
              disabled={!answeredAll}
              onClick={() => {
                setSubmitted(true);
                if (score >= quiz.settings.passingScore) onPassed();
              }}
            >
              {t("admin.training.preview.quizSubmit")}
            </AdminButton>
          ) : (
            quiz.settings.allowRetry &&
            !passed && (
              <AdminButton variant="outline" iconLeft={RotateCcw} onClick={retry}>
                {t("admin.training.preview.quizRetry")}
              </AdminButton>
            )
          )}
          {!answeredAll && !submitted && (
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("admin.training.preview.chooseAnswer")}
            </span>
          )}
        </div>
      </div>
    </div>
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
