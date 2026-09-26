import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Copy,
  ImagePlus,
  ListChecks,
  MoveDown,
  MoveUp,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../AdminButton";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { EmptyState } from "../EmptyState";
import { FormField } from "../FormField";
import { ToggleSwitch } from "../ToggleSwitch";
import { MediaPicker } from "./MediaPicker";
import { Section } from "./TrainingPrimitives";
import type { Module, Question, Quiz } from "../../../data/adminTraining";
import { useAdminTraining } from "../../../lib/adminTraining";
import { useToast } from "../../../lib/toast";
import { dragClasses, useDragReorder, type DragItemProps } from "../../../lib/useDragReorder";
import type { ContentLang } from "../../../lib/localized";

/**
 * The quiz builder.
 *
 * Questions are a numbered, collapsible list: five questions have to be
 * readable at a glance, and five expanded question editors would not be. One
 * question opens at a time, and the collapsed row still shows what matters —
 * the question, how many answers it has, and whether a correct one is marked.
 *
 * The two feedback messages are edited separately and sit side by side, because
 * the pair is the point: one reassures, one redirects, and writing them
 * together is what stops the second from being an afterthought.
 */
export function QuizBuilder({
  courseId,
  module,
  quiz,
  lang,
}: {
  courseId: string;
  module: Module;
  quiz: Quiz;
  lang: ContentLang;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { updateQuiz, addQuestion, duplicateQuestion, deleteQuestion, moveQuestion, deleteQuiz } =
    useAdminTraining();

  const [open, setOpen] = useState<string | null>(quiz.questions[0]?.id ?? null);
  const [removing, setRemoving] = useState<Question | null>(null);
  const [removingQuiz, setRemovingQuiz] = useState(false);

  const drag = useDragReorder((id, to) => moveQuestion(courseId, module.id, id, to));

  const add = () => {
    const id = addQuestion(courseId, module.id);
    if (id) setOpen(id);
    showToast(t("admin.training.toasts.questionAddedTitle"));
  };

  return (
    <div className="grid gap-4">
      <Section
        title={quiz.title[lang] || t("admin.training.quiz.heading")}
        description={t("admin.training.quiz.description")}
        icon={ListChecks}
        aside={
          <span className="inline-flex flex-none items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--gt-emerald-50)] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--accent-cta-ink)]">
            <ListChecks size={13} strokeWidth={2.2} aria-hidden="true" />
            {t("admin.training.quiz.count", { count: quiz.questions.length })}
          </span>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label={t("admin.training.quiz.fieldTitle")}>
            {(props) => (
              <input
                {...props}
                type="text"
                className="gt-admin-field"
                value={quiz.title[lang]}
                onChange={(e) => updateQuiz(courseId, module.id, { title: { ...quiz.title, [lang]: e.target.value } })}
              />
            )}
          </FormField>

          <FormField label={t("admin.training.quiz.fieldIntro")} hint={t("admin.training.quiz.fieldIntroHint")}>
            {(props) => (
              <input
                {...props}
                type="text"
                className="gt-admin-field"
                value={quiz.intro[lang]}
                onChange={(e) => updateQuiz(courseId, module.id, { intro: { ...quiz.intro, [lang]: e.target.value } })}
              />
            )}
          </FormField>
        </div>
      </Section>

      <Section title={t("admin.training.quiz.questions")} description={t("admin.training.quiz.answersHint")}>
        {quiz.questions.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title={t("admin.training.quiz.emptyTitle")}
            body={t("admin.training.quiz.emptyBody")}
            action={
              <AdminButton variant="primary" iconLeft={Plus} onClick={add}>
                {t("admin.training.quiz.addFirstQuestion")}
              </AdminButton>
            }
          />
        ) : (
          <div className="grid gap-2">
            {quiz.questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                courseId={courseId}
                moduleId={module.id}
                question={question}
                index={index}
                total={quiz.questions.length}
                lang={lang}
                open={open === question.id}
                onToggle={() => setOpen((current) => (current === question.id ? null : question.id))}
                onDuplicate={() => {
                  duplicateQuestion(courseId, module.id, question.id);
                  showToast(t("admin.training.toasts.questionDuplicatedTitle"));
                }}
                onDelete={() => setRemoving(question)}
                onMove={(to) => moveQuestion(courseId, module.id, question.id, to)}
                dragProps={drag.itemProps(question.id, index)}
                dragClassName={dragClasses(drag, question.id)}
              />
            ))}

            <AdminButton variant="outline" iconLeft={Plus} fullWidth className="border-dashed" onClick={add}>
              {t("admin.training.quiz.addQuestion")}
            </AdminButton>
          </div>
        )}
      </Section>

      <div className="flex justify-end">
        <AdminButton
          variant="ghost"
          size="sm"
          iconLeft={Trash2}
          onClick={() => setRemovingQuiz(true)}
          className="text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
        >
          {t("admin.training.quiz.deleteQuiz")}
        </AdminButton>
      </div>

      <ConfirmationDialog
        open={removing !== null}
        icon={Trash2}
        tone="danger"
        title={t("admin.training.quiz.deleteQuestionTitle")}
        body={<p className="m-0">{t("admin.training.quiz.deleteQuestionBody")}</p>}
        confirmLabel={t("admin.training.actions.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (removing) deleteQuestion(courseId, module.id, removing.id);
          setRemoving(null);
          showToast(t("admin.training.toasts.questionDeletedTitle"), undefined, "info");
        }}
        onCancel={() => setRemoving(null)}
      />

      <ConfirmationDialog
        open={removingQuiz}
        icon={Trash2}
        tone="danger"
        title={t("admin.training.quiz.deleteQuizTitle")}
        body={<p className="m-0">{t("admin.training.quiz.deleteQuizBody", { count: quiz.questions.length })}</p>}
        confirmLabel={t("admin.training.quiz.deleteQuiz")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          deleteQuiz(courseId, module.id);
          setRemovingQuiz(false);
          showToast(t("admin.training.toasts.quizDeletedTitle"), undefined, "info");
        }}
        onCancel={() => setRemovingQuiz(false)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One question                                                                */
/* -------------------------------------------------------------------------- */

function QuestionCard({
  courseId,
  moduleId,
  question,
  index,
  total,
  lang,
  open,
  onToggle,
  onDuplicate,
  onDelete,
  onMove,
  dragProps,
  dragClassName,
}: {
  courseId: string;
  moduleId: string;
  question: Question;
  index: number;
  total: number;
  lang: ContentLang;
  open: boolean;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (to: "up" | "down") => void;
  dragProps: DragItemProps;
  dragClassName: string;
}) {
  const { t } = useTranslation();
  const { updateQuestion, addAnswer, updateAnswer, deleteAnswer, setCorrectAnswer } = useAdminTraining();
  const [showImagePicker, setShowImagePicker] = useState(false);

  const number = String(index + 1).padStart(2, "0");
  const hasCorrect = question.answers.some((a) => a.correct);

  return (
    <article
      {...dragProps}
      className={clsx(
        "rounded-[var(--admin-radius)] border transition-colors",
        open ? "border-[var(--gt-ink-900)] shadow-[var(--shadow-sm)]" : "border-[var(--border-subtle)] hover:border-[var(--gt-ink-400)]",
        dragClassName,
      )}
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {open ? (
            <ChevronDown size={15} strokeWidth={2.2} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
          ) : (
            <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
          )}
          <span
            aria-hidden="true"
            className="grid h-7 w-7 flex-none place-items-center rounded-[var(--radius-xs)] bg-[var(--surface-sunken)] text-[10px] font-bold tabular-nums text-[var(--text-muted)]"
          >
            {number}
          </span>
          <span className="grid min-w-0 flex-1 gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
              {t("admin.training.quiz.questionLabel", { number })}
            </span>
            <span className="truncate text-[length:var(--text-body-sm)] font-medium text-[var(--text-primary)]">
              {question.text[lang] || t("admin.training.quiz.questionText")}
            </span>
          </span>
        </button>

        <span className="flex flex-none items-center gap-1.5">
          {hasCorrect ? (
            <span className="hidden items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-emerald-50)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-cta-ink)] sm:inline-flex">
              <Check size={10} strokeWidth={3} aria-hidden="true" />
              {question.answers.length}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--status-warning-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--status-warning-fg)]">
              <TriangleAlert size={10} strokeWidth={2.4} aria-hidden="true" />
              {t("admin.training.quiz.noCorrect")}
            </span>
          )}

          <QuestionAction
            icon={MoveUp}
            label={t("admin.training.quiz.moveQuestionUp")}
            disabled={index === 0}
            onClick={() => onMove("up")}
          />
          <QuestionAction
            icon={MoveDown}
            label={t("admin.training.quiz.moveQuestionDown")}
            disabled={index === total - 1}
            onClick={() => onMove("down")}
          />
          <QuestionAction icon={Copy} label={t("admin.training.quiz.duplicateQuestion")} onClick={onDuplicate} />
          <QuestionAction icon={Trash2} label={t("admin.training.actions.delete")} tone="danger" onClick={onDelete} />
        </span>
      </div>

      {open && (
        <div className="grid gap-4 border-t border-[var(--border-subtle)] p-4">
          <FormField
            label={t("admin.training.quiz.questionText")}
            hint={t("admin.training.quiz.questionTextHint")}
            required
          >
            {(props) => (
              <textarea
                {...props}
                rows={2}
                className="gt-admin-field"
                value={question.text[lang]}
                onChange={(e) =>
                  updateQuestion(courseId, moduleId, question.id, {
                    text: { ...question.text, [lang]: e.target.value },
                  })
                }
              />
            )}
          </FormField>

          {/* Optional image */}
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                {t("admin.training.quiz.questionImage")}
              </span>
              {question.image ? (
                <AdminButton
                  variant="ghost"
                  size="sm"
                  iconLeft={X}
                  onClick={() => updateQuestion(courseId, moduleId, question.id, { image: undefined })}
                >
                  {t("admin.training.quiz.questionImageRemove")}
                </AdminButton>
              ) : (
                <AdminButton
                  variant="ghost"
                  size="sm"
                  iconLeft={ImagePlus}
                  onClick={() => setShowImagePicker((v) => !v)}
                >
                  {t("admin.training.quiz.questionImageAdd")}
                </AdminButton>
              )}
            </div>

            {question.image && (
              <img
                src={question.image}
                alt=""
                aria-hidden="true"
                className="max-w-[280px] rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] object-cover"
              />
            )}

            {(showImagePicker || question.image) && (
              <MediaPicker
                value={question.image ?? ""}
                onChange={(image) => {
                  updateQuestion(courseId, moduleId, question.id, { image });
                  setShowImagePicker(false);
                }}
                label={t("admin.training.quiz.questionImage")}
                hint={t("admin.training.quiz.questionImageHint")}
                columns={4}
              />
            )}
          </div>

          {/* Answers */}
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="p-0 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.training.quiz.answers")}
            </legend>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {t("admin.training.quiz.answersHint")}
            </p>

            <ul className="m-0 grid list-none gap-2 p-0">
              {question.answers.map((answer, answerIndex) => (
                <li
                  key={answer.id}
                  className={clsx(
                    "grid gap-2 rounded-[var(--admin-radius-sm)] border p-2.5 transition-colors",
                    answer.correct
                      ? "border-[var(--gt-emerald-500)] bg-[var(--gt-emerald-50)]"
                      : "border-[var(--border-subtle)]",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {/* A radio, not a checkbox: exactly one answer is correct,
                        and the platform's radio group says so and gives arrow-key
                        navigation for free. */}
                    <label className="flex flex-none cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${question.id}`}
                        checked={answer.correct}
                        onChange={() => setCorrectAnswer(courseId, moduleId, question.id, answer.id)}
                        className="h-4 w-4 accent-[var(--gt-emerald-500)]"
                      />
                      <span className="sr-only">
                        {t("admin.training.quiz.markCorrect", { name: answer.text[lang] })}
                      </span>
                    </label>

                    <input
                      type="text"
                      value={answer.text[lang]}
                      placeholder={t("admin.training.quiz.answerPlaceholder")}
                      aria-label={t("admin.training.quiz.answerLabel", { number: answerIndex + 1 })}
                      onChange={(e) =>
                        updateAnswer(courseId, moduleId, question.id, answer.id, {
                          text: { ...answer.text, [lang]: e.target.value },
                        })
                      }
                      className="gt-admin-field"
                    />

                    {answer.correct && (
                      <span className="hidden flex-none items-center gap-1 text-[length:var(--text-caption)] font-semibold text-[var(--accent-cta-ink)] sm:inline-flex">
                        <CircleCheck size={13} strokeWidth={2.2} aria-hidden="true" />
                        {t("admin.training.quiz.correct")}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => deleteAnswer(courseId, moduleId, question.id, answer.id)}
                      disabled={question.answers.length <= 2}
                      aria-label={`${t("admin.training.quiz.removeAnswer")} ${answerIndex + 1}`}
                      title={t("admin.training.quiz.removeAnswer")}
                      className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-[var(--radius-xs)] text-[var(--text-muted)] transition-colors hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <X size={14} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={answer.explanation?.[lang] ?? ""}
                    placeholder={t("admin.training.quiz.answerExplanationHint")}
                    aria-label={`${t("admin.training.quiz.answerExplanation")} ${answerIndex + 1}`}
                    onChange={(e) =>
                      updateAnswer(courseId, moduleId, question.id, answer.id, {
                        explanation: {
                          fr: answer.explanation?.fr ?? "",
                          en: answer.explanation?.en ?? "",
                          [lang]: e.target.value,
                        },
                      })
                    }
                    className="gt-admin-field min-h-[34px] text-[length:var(--text-caption)]"
                  />
                </li>
              ))}
            </ul>

            <div>
              <AdminButton
                variant="ghost"
                size="sm"
                iconLeft={Plus}
                onClick={() => addAnswer(courseId, moduleId, question.id)}
              >
                {t("admin.training.quiz.addAnswer")}
              </AdminButton>
            </div>
          </fieldset>

          {/* Feedback */}
          <div className="grid gap-3 rounded-[var(--admin-radius-sm)] bg-[var(--admin-panel-sunken)] p-3">
            <div className="grid gap-0.5">
              <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                {t("admin.training.quiz.feedback")}
              </span>
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("admin.training.quiz.feedbackHint")}
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <FormField label={t("admin.training.quiz.correctFeedback")}>
                {(props) => (
                  <textarea
                    {...props}
                    rows={2}
                    placeholder={t("admin.training.quiz.correctFeedbackPlaceholder")}
                    className="gt-admin-field"
                    value={question.correctFeedback[lang]}
                    onChange={(e) =>
                      updateQuestion(courseId, moduleId, question.id, {
                        correctFeedback: { ...question.correctFeedback, [lang]: e.target.value },
                      })
                    }
                  />
                )}
              </FormField>

              <FormField label={t("admin.training.quiz.incorrectFeedback")}>
                {(props) => (
                  <textarea
                    {...props}
                    rows={2}
                    placeholder={t("admin.training.quiz.incorrectFeedbackPlaceholder")}
                    className="gt-admin-field"
                    value={question.incorrectFeedback[lang]}
                    onChange={(e) =>
                      updateQuestion(courseId, moduleId, question.id, {
                        incorrectFeedback: { ...question.incorrectFeedback, [lang]: e.target.value },
                      })
                    }
                  />
                )}
              </FormField>
            </div>

            <FormField label={t("admin.training.quiz.learnMore")} hint={t("admin.training.quiz.learnMoreHint")}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className="gt-admin-field"
                  value={question.learnMore?.[lang] ?? ""}
                  onChange={(e) =>
                    updateQuestion(courseId, moduleId, question.id, {
                      learnMore: {
                        fr: question.learnMore?.fr ?? "",
                        en: question.learnMore?.en ?? "",
                        [lang]: e.target.value,
                      },
                    })
                  }
                />
              )}
            </FormField>
          </div>
        </div>
      )}
    </article>
  );
}

function QuestionAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "default",
}: {
  icon: typeof Copy;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-xs)] transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-30",
        tone === "danger"
          ? "text-[var(--text-muted)] hover:bg-[var(--status-error-bg)] hover:text-[var(--status-error-fg)]"
          : "text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
      )}
    >
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Quiz settings, shown in the builder's properties panel.
 *
 * The copy is deliberately reassuring: a passing score presented as a hurdle
 * makes an administrator lower it, where the same number presented alongside
 * "learners can retry" gets left where it belongs.
 */
export function QuizSettingsPanel({
  courseId,
  moduleId,
  quiz,
}: {
  courseId: string;
  moduleId: string;
  quiz: Quiz;
}) {
  const { t } = useTranslation();
  const { updateQuiz } = useAdminTraining();
  const settings = quiz.settings;

  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) =>
    updateQuiz(courseId, moduleId, { settings: { ...settings, [key]: value } });

  return (
    <div className="grid gap-4">
      <div className="grid gap-0.5">
        <h3 className="text-[length:var(--text-body-sm)] font-semibold">{t("admin.training.quiz.settings")}</h3>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.training.quiz.settingsHint")}
        </p>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor="quiz-passing"
            className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]"
          >
            {t("admin.training.quiz.passingScore")}
          </label>
          <span className="text-[length:var(--text-body-sm)] font-bold tabular-nums text-[var(--text-primary)]">
            {settings.passingScore} %
          </span>
        </div>
        <input
          id="quiz-passing"
          type="range"
          min={40}
          max={100}
          step={5}
          value={settings.passingScore}
          onChange={(e) => set("passingScore", Number(e.target.value))}
          className="w-full accent-[var(--gt-emerald-500)]"
        />
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("admin.training.quiz.passingScoreHint")}
        </p>
      </div>

      <span aria-hidden="true" className="block h-px bg-[var(--border-subtle)]" />

      <ToggleSwitch
        label={t("admin.training.quiz.allowRetry")}
        description={t("admin.training.quiz.allowRetryHint")}
        checked={settings.allowRetry}
        onChange={(v) => set("allowRetry", v)}
      />

      {settings.allowRetry && (
        <FormField label={t("admin.training.quiz.attempts")} hint={t("admin.training.quiz.attemptsHint")}>
          {(props) => (
            <input
              {...props}
              type="number"
              min={1}
              max={10}
              className="gt-admin-field tabular-nums"
              value={settings.attempts}
              onChange={(e) => set("attempts", Math.max(1, Number(e.target.value) || 1))}
            />
          )}
        </FormField>
      )}

      <span aria-hidden="true" className="block h-px bg-[var(--border-subtle)]" />

      <ToggleSwitch
        label={t("admin.training.quiz.shuffle")}
        description={t("admin.training.quiz.shuffleHint")}
        checked={settings.shuffleAnswers}
        onChange={(v) => set("shuffleAnswers", v)}
      />

      <ToggleSwitch
        label={t("admin.training.quiz.immediate")}
        description={t("admin.training.quiz.immediateHint")}
        checked={settings.immediateFeedback}
        onChange={(v) => set("immediateFeedback", v)}
      />

      <ToggleSwitch
        label={t("admin.training.quiz.showAnswers")}
        description={t("admin.training.quiz.showAnswersHint")}
        checked={settings.showAnswers}
        onChange={(v) => set("showAnswers", v)}
      />
    </div>
  );
}
