import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Eye, FileText, Layers, ListChecks, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { AdminButton } from "../AdminButton";
import { ConfirmationDialog } from "../ConfirmationDialog";
import { EmptyState } from "../EmptyState";
import { FormField } from "../FormField";
import { MediaPicker } from "./MediaPicker";
import { ObjectiveList } from "./ObjectiveList";
import { MetaPill, Section } from "./TrainingPrimitives";
import { blockCount, moduleDuration, type Module } from "../../../data/adminTraining";
import { useAdminTraining } from "../../../lib/adminTraining";
import { formatDuration } from "../../../lib/trainingFilters";
import { useToast } from "../../../lib/toast";
import type { ContentLang } from "../../../lib/localized";
import type { Selection } from "../../../lib/trainingSelection";

/**
 * The module editor.
 *
 * It opens with the summary an administrator actually asks for — "three
 * learning steps plus a final knowledge check" — because the first question at
 * this level is never "what is the title", it is "what is in here and what is
 * missing". The fields follow underneath.
 */
export function ModuleEditor({
  courseId,
  module,
  index,
  total,
  lang,
  onSelect,
  onPreview,
}: {
  courseId: string;
  module: Module;
  index: number;
  total: number;
  lang: ContentLang;
  onSelect: (selection: Selection) => void;
  onPreview: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const { updateModule, addStep, addQuiz, deleteModule } = useAdminTraining();
  const [removing, setRemoving] = useState(false);

  const number = String(index + 1).padStart(2, "0");
  const steps = module.steps.length;
  const filledSteps = module.steps.filter((s) => s.blocks.length > 0).length;
  const completion = steps === 0 ? 0 : Math.round((filledSteps / steps) * 100);

  const summary = module.quiz
    ? t("admin.training.module.summaryWithQuiz", { count: steps })
    : t("admin.training.module.summaryNoQuiz", { count: steps });

  return (
    <div className="grid gap-4">
      {/* Visual summary */}
      <section className="gt-admin-panel overflow-hidden">
        <div className="grid gap-0 sm:grid-cols-[200px_minmax(0,1fr)]">
          <img
            src={module.cover}
            alt=""
            aria-hidden="true"
            className="h-full max-h-[190px] w-full object-cover sm:max-h-none"
          />
          <div className="grid content-start gap-3 p-5">
            <div className="grid gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
                {t("admin.training.builder.moduleLabel", { number })}
              </span>
              <h2 className="text-[length:var(--text-h3)]">
                {module.title[lang] || t("admin.training.module.fieldTitle")}
              </h2>
              <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{summary}</p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <MetaPill icon={FileText}>{t("admin.training.list.steps", { count: steps })}</MetaPill>
              <MetaPill icon={Clock}>{formatDuration(moduleDuration(module), i18n.language)}</MetaPill>
              <MetaPill icon={Layers}>
                {t("admin.training.builder.blocks", { count: blockCount(module) })}
              </MetaPill>
              {module.quiz ? (
                <MetaPill icon={ListChecks}>
                  {t("admin.training.builder.quizQuestions", { count: module.quiz.questions.length })}
                </MetaPill>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-dashed border-[var(--border-default)] px-2.5 py-1 text-[length:var(--text-caption)] font-medium text-[var(--text-subtle)]">
                  <ListChecks size={12} strokeWidth={2} aria-hidden="true" />
                  {t("admin.training.list.noQuiz")}
                </span>
              )}
            </div>

            {/* Completion: a bar, a percentage and a sentence. The bar alone
                would put the meaning in colour and length only. */}
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                  {t("admin.training.module.completion")}
                </span>
                <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
                  {completion} %
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={completion}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t("admin.training.module.completion")}
                className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-sunken)]"
              >
                <span
                  className={clsx(
                    "block h-full rounded-[var(--radius-pill)] transition-[width] duration-[var(--duration-normal)]",
                    completion === 100 ? "bg-[var(--gt-emerald-500)]" : "bg-[var(--gt-blue-400)]",
                  )}
                  style={{ width: `${completion}%` }}
                />
              </div>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
                {t("admin.training.module.completionHint")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <AdminButton
                variant="primary"
                size="sm"
                iconLeft={Plus}
                onClick={() => {
                  const id = addStep(courseId, module.id);
                  if (id) onSelect({ kind: "step", moduleId: module.id, stepId: id });
                  showToast(t("admin.training.toasts.stepAddedTitle"), t("admin.training.toasts.stepAddedBody"));
                }}
              >
                {t("admin.training.module.addStep")}
              </AdminButton>
              <AdminButton
                variant="outline"
                size="sm"
                iconLeft={ListChecks}
                disabled={module.quiz !== null}
                onClick={() => {
                  addQuiz(courseId, module.id);
                  onSelect({ kind: "quiz", moduleId: module.id });
                  showToast(t("admin.training.toasts.quizAddedTitle"), t("admin.training.toasts.quizAddedBody"));
                }}
              >
                {t("admin.training.module.addQuiz")}
              </AdminButton>
              <AdminButton variant="ghost" size="sm" iconLeft={Eye} onClick={onPreview}>
                {t("admin.training.module.previewModule")}
              </AdminButton>
            </div>
          </div>
        </div>
      </section>

      {/* Fields */}
      <Section title={t("admin.training.module.title")} icon={Layers}>
        <div className="grid gap-4">
          <FormField
            label={t("admin.training.module.fieldTitle")}
            hint={t("admin.training.module.fieldTitleHint")}
            required
          >
            {(props) => (
              <input
                {...props}
                type="text"
                className="gt-admin-field"
                value={module.title[lang]}
                onChange={(e) => updateModule(courseId, module.id, { title: { ...module.title, [lang]: e.target.value } })}
              />
            )}
          </FormField>

          <FormField
            label={t("admin.training.module.fieldDescription")}
            hint={t("admin.training.module.fieldDescriptionHint")}
          >
            {(props) => (
              <textarea
                {...props}
                rows={3}
                className="gt-admin-field"
                value={module.description[lang]}
                onChange={(e) =>
                  updateModule(courseId, module.id, { description: { ...module.description, [lang]: e.target.value } })
                }
              />
            )}
          </FormField>

          <ObjectiveList
            items={module.objectives}
            lang={lang}
            onChange={(objectives) => updateModule(courseId, module.id, { objectives })}
            label={t("admin.training.module.objectives")}
            hint={t("admin.training.module.objectivesHint")}
            addLabel={t("admin.training.module.objectiveAdd")}
            placeholder={t("admin.training.module.objectivePlaceholder")}
            removeLabel={t("admin.training.module.objectiveRemove")}
            emptyLabel={t("admin.training.module.objectivesHint")}
          />

          <MediaPicker
            value={module.cover}
            onChange={(cover) => updateModule(courseId, module.id, { cover })}
            label={t("admin.training.module.fieldCover")}
            hint={t("admin.training.module.fieldCoverHint")}
          />
        </div>
      </Section>

      {/* Steps */}
      <Section
        title={t("admin.training.module.steps")}
        description={t("admin.training.module.stepsHint")}
        icon={FileText}
      >
        {module.steps.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t("admin.training.module.emptyStepsTitle")}
            body={t("admin.training.module.emptyStepsBody")}
            action={
              <AdminButton
                variant="primary"
                iconLeft={Plus}
                onClick={() => {
                  const id = addStep(courseId, module.id);
                  if (id) onSelect({ kind: "step", moduleId: module.id, stepId: id });
                }}
              >
                {t("admin.training.module.addStep")}
              </AdminButton>
            }
          />
        ) : (
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {module.steps.map((step, stepIndex) => (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: "step", moduleId: module.id, stepId: step.id })}
                  className="flex w-full items-center gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-3 text-left transition-colors hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-blue-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                >
                  <span
                    aria-hidden="true"
                    className="grid h-8 w-8 flex-none place-items-center rounded-[var(--radius-xs)] bg-[var(--surface-sunken)] text-[length:var(--text-caption)] font-bold tabular-nums text-[var(--text-muted)]"
                  >
                    {String(stepIndex + 1).padStart(2, "0")}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                      {step.title[lang]}
                    </span>
                    <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {step.summary[lang] ||
                        t("admin.training.step.blocksSummary", { count: step.blocks.length })}
                    </span>
                  </span>
                  <span className="flex-none text-[length:var(--text-caption)] tabular-nums text-[var(--text-subtle)]">
                    {step.duration} {t("admin.training.step.minutes")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Knowledge check */}
      <Section title={t("admin.training.module.quizSection")} icon={ListChecks}>
        {module.quiz ? (
          <button
            type="button"
            onClick={() => onSelect({ kind: "quiz", moduleId: module.id })}
            className="flex w-full items-center gap-3 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-3 text-left transition-colors hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-blue-50)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <span
              aria-hidden="true"
              className="grid h-8 w-8 flex-none place-items-center rounded-[var(--radius-xs)] bg-[var(--gt-emerald-50)] text-[var(--accent-cta-ink)]"
            >
              <ListChecks size={15} strokeWidth={2} />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                {module.quiz.title[lang]}
              </span>
              <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {t("admin.training.quiz.count", { count: module.quiz.questions.length })}
              </span>
            </span>
            <span className="flex-none text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.training.module.openQuiz")}
            </span>
          </button>
        ) : (
          <EmptyState
            icon={ListChecks}
            title={t("admin.training.module.quizNone")}
            body={t("admin.training.module.quizNoneBody")}
            action={
              <AdminButton
                variant="primary"
                iconLeft={Plus}
                onClick={() => {
                  addQuiz(courseId, module.id);
                  onSelect({ kind: "quiz", moduleId: module.id });
                  showToast(t("admin.training.toasts.quizAddedTitle"), t("admin.training.toasts.quizAddedBody"));
                }}
              >
                {t("admin.training.module.addQuiz")}
              </AdminButton>
            }
          />
        )}
      </Section>

      {/* Destructive actions sit at the bottom, away from everything routine. */}
      <div className="flex justify-end">
        <AdminButton
          variant="ghost"
          size="sm"
          iconLeft={Trash2}
          onClick={() => setRemoving(true)}
          className="text-[var(--status-error-fg)] hover:bg-[var(--status-error-bg)]"
        >
          {t("admin.training.module.deleteTitle")}
        </AdminButton>
      </div>

      <ConfirmationDialog
        open={removing}
        icon={Trash2}
        tone="danger"
        title={t("admin.training.module.deleteTitle")}
        body={
          <>
            <p className="m-0">{t("admin.training.module.deleteBody", { name: module.title[lang] })}</p>
            <p className="m-0 mt-2 font-semibold text-[var(--status-error-fg)]">
              {t("admin.training.module.deleteWarning")}
            </p>
          </>
        }
        confirmLabel={t("admin.training.actions.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          deleteModule(courseId, module.id);
          setRemoving(false);
          onSelect({ kind: "course" });
          showToast(t("admin.training.toasts.moduleDeletedTitle"), undefined, "info");
        }}
        onCancel={() => setRemoving(false)}
      />

      <p className="sr-only">{t("admin.training.builder.moduleLabel", { number })} — {index + 1}/{total}</p>
    </div>
  );
}
