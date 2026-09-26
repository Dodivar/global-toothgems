import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CircleCheck, Clock, FileText, Image as ImageIcon, ListChecks, TriangleAlert, Video } from "lucide-react";
import clsx from "clsx";
import { QuizSettingsPanel } from "./QuizBuilder";
import { MetaPill, StatusBadge } from "./TrainingPrimitives";
import {
  blockCount,
  moduleDuration,
  questionCount,
  quizCount,
  stepCount,
  type BlockType,
  type TrainingCourse,
} from "../../../data/adminTraining";
import { analyseCourse } from "../../../lib/trainingReadiness";
import { formatDuration } from "../../../lib/trainingFilters";
import type { ContentLang } from "../../../lib/localized";
import type { Selection } from "../../../lib/trainingSelection";

/**
 * The builder's third panel: facts about whatever is selected, and the settings
 * that belong to it.
 *
 * It answers "what remains to be completed" at every level — how ready the
 * course is, how full a module is, what a step actually contains — so the
 * centre panel can stay about editing one thing rather than reporting on it.
 */
export function PropertiesPanel({
  course,
  selection,
  lang,
}: {
  course: TrainingCourse;
  selection: Selection;
  lang: ContentLang;
}) {
  const { t, i18n } = useTranslation();

  if (selection.kind === "course") {
    const readiness = analyseCourse(course);
    return (
      <div className="grid gap-4">
        <Header title={t("admin.training.builder.course")} />

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={course.status} />
          <MetaPill>{t(`admin.training.level.${course.level}`)}</MetaPill>
        </div>

        <Facts
          rows={[
            { label: t("admin.training.list.modules", { count: course.modules.length }), value: course.modules.length },
            { label: t("admin.training.list.steps", { count: stepCount(course) }), value: stepCount(course) },
            { label: t("admin.training.list.quizzes", { count: quizCount(course) }), value: quizCount(course) },
            {
              label: t("admin.training.list.questions", { count: questionCount(course) }),
              value: questionCount(course),
            },
          ]}
        />

        <div className="grid gap-2 rounded-[var(--admin-radius-sm)] border border-[var(--border-subtle)] p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.training.review.readiness")}
            </span>
            <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
              {readiness.score} %
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={readiness.score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("admin.training.review.readiness")}
            className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-sunken)]"
          >
            <span
              className={clsx(
                "block h-full rounded-[var(--radius-pill)]",
                readiness.publishable ? "bg-[var(--gt-emerald-400)]" : "bg-[var(--gt-amber-400)]",
              )}
              style={{ width: `${readiness.score}%` }}
            />
          </div>

          <p
            className={clsx(
              "m-0 flex items-start gap-1.5 text-[length:var(--text-caption)]",
              readiness.publishable ? "text-[var(--status-success-fg)]" : "text-[var(--status-warning-fg)]",
            )}
          >
            {readiness.publishable ? (
              <CircleCheck size={13} strokeWidth={2.2} aria-hidden="true" className="mt-0.5 flex-none" />
            ) : (
              <TriangleAlert size={13} strokeWidth={2.2} aria-hidden="true" className="mt-0.5 flex-none" />
            )}
            {readiness.publishable
              ? t("admin.training.review.ready")
              : t("admin.training.review.blocking", { count: readiness.blocking.length })}
          </p>

          {/* A link wearing the panel button's clothes: this leaves the
              builder, and anything that navigates should survive a middle
              click. */}
          <Link
            to={`/admin/formations/${course.id}/publication`}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[var(--admin-radius-sm)] border border-[var(--border-default)] bg-[var(--admin-panel)] px-3 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--gt-ink-400)] hover:bg-[var(--gt-ink-100)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <CircleCheck size={14} strokeWidth={2} aria-hidden="true" />
            {t("admin.training.builder.reviewAndPublish")}
          </Link>
        </div>
      </div>
    );
  }

  const module = course.modules.find((m) => m.id === selection.moduleId);
  if (!module) return null;
  const index = course.modules.findIndex((m) => m.id === module.id);
  const number = String(index + 1).padStart(2, "0");

  if (selection.kind === "quiz" && module.quiz) {
    return (
      <div className="grid gap-4">
        <Header
          title={t("admin.training.quiz.heading")}
          subtitle={`${t("admin.training.builder.moduleLabel", { number })} — ${module.title[lang]}`}
        />
        <QuizSettingsPanel courseId={course.id} moduleId={module.id} quiz={module.quiz} />
      </div>
    );
  }

  if (selection.kind === "step") {
    const step = module.steps.find((s) => s.id === selection.stepId);
    if (!step) return null;
    const stepIndex = module.steps.findIndex((s) => s.id === step.id);

    const byType = (type: BlockType) => step.blocks.filter((b) => b.type === type).length;

    return (
      <div className="grid gap-4">
        <Header
          title={t("admin.training.builder.stepLabel", { number: String(stepIndex + 1).padStart(2, "0") })}
          subtitle={`${t("admin.training.builder.moduleLabel", { number })} — ${module.title[lang]}`}
        />

        <p className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {step.title[lang]}
        </p>

        <div className="flex flex-wrap gap-1.5">
          <MetaPill icon={Clock}>
            {step.duration} {t("admin.training.step.minutes")}
          </MetaPill>
        </div>

        <Facts
          rows={[
            { label: t("admin.training.blocks.text"), value: byType("text"), icon: FileText },
            { label: t("admin.training.blocks.image"), value: byType("image"), icon: ImageIcon },
            { label: t("admin.training.blocks.video"), value: byType("video"), icon: Video },
          ]}
        />

        {step.blocks.some((b) => b.type === "image" && b.alt[lang].trim() === "") && (
          <p className="m-0 flex items-start gap-1.5 rounded-[var(--admin-radius-sm)] bg-[var(--status-warning-bg)] p-2.5 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
            <TriangleAlert size={13} strokeWidth={2.2} aria-hidden="true" className="mt-0.5 flex-none" />
            {t("admin.training.blocks.imageAltMissing")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <Header title={t("admin.training.builder.moduleLabel", { number })} subtitle={module.title[lang]} />

      <div className="flex flex-wrap gap-1.5">
        <MetaPill icon={Clock}>{formatDuration(moduleDuration(module), i18n.language)}</MetaPill>
        {module.quiz ? (
          <MetaPill icon={ListChecks}>
            {t("admin.training.builder.quizQuestions", { count: module.quiz.questions.length })}
          </MetaPill>
        ) : (
          <MetaPill icon={ListChecks}>{t("admin.training.list.noQuiz")}</MetaPill>
        )}
      </div>

      <Facts
        rows={[
          { label: t("admin.training.module.steps"), value: module.steps.length, icon: FileText },
          { label: t("admin.training.blocks.addTitle"), value: blockCount(module), icon: ImageIcon },
          { label: t("admin.training.module.objectives"), value: module.objectives.length, icon: CircleCheck },
        ]}
      />

      {module.steps.length === 0 && (
        <p className="m-0 flex items-start gap-1.5 rounded-[var(--admin-radius-sm)] bg-[var(--status-warning-bg)] p-2.5 text-[length:var(--text-caption)] text-[var(--status-warning-fg)]">
          <TriangleAlert size={13} strokeWidth={2.2} aria-hidden="true" className="mt-0.5 flex-none" />
          {t("admin.training.module.emptyStepsTitle")}
        </p>
      )}
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--text-subtle)]">
        {title}
      </span>
      {subtitle && (
        <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {subtitle}
        </span>
      )}
    </div>
  );
}

function Facts({
  rows,
}: {
  rows: { label: string; value: number; icon?: typeof FileText }[];
}) {
  return (
    <dl className="m-0 grid gap-1.5">
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-1.5 last:border-0 last:pb-0"
        >
          <dt className="flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {row.icon && <row.icon size={12} strokeWidth={2} aria-hidden="true" />}
            {row.label}
          </dt>
          <dd className="m-0 text-[length:var(--text-body-sm)] font-semibold tabular-nums text-[var(--text-primary)]">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
