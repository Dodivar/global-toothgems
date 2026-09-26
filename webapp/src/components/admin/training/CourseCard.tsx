import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  CircleCheck,
  Clock,
  Copy,
  Eye,
  ListChecks,
  Pencil,
  Trash2,
  Upload,
  Users,
  Wrench,
} from "lucide-react";
import { OverflowMenu, type MenuAction } from "../OverflowMenu";
import { AdminButton } from "../AdminButton";
import { CountRow, MetaPill, StatusBadge } from "./TrainingPrimitives";
import {
  getInstructor,
  questionCount,
  quizCount,
  stepCount,
  type TrainingCourse,
} from "../../../data/adminTraining";
import { formatDuration } from "../../../lib/trainingFilters";
import { useLocalized } from "../../../lib/localized";

export interface CourseActions {
  onEdit: (course: TrainingCourse) => void;
  onPreview: (course: TrainingCourse) => void;
  onDuplicate: (course: TrainingCourse) => void;
  onReview: (course: TrainingCourse) => void;
  onUnpublish: (course: TrainingCourse) => void;
  onDelete: (course: TrainingCourse) => void;
}

/**
 * One training in the catalogue.
 *
 * A card rather than a table row: a course is a thumbnail, a hierarchy and a
 * progress figure, and none of those survive being squeezed into a cell. The
 * brief asks for a highly scannable page, and what makes this one scannable is
 * that every card answers the same four questions in the same four places —
 * what it is, what is in it, how ready it is, and how it is doing.
 */
export function CourseCard({ course, actions }: { course: TrainingCourse; actions: CourseActions }) {
  const { t, i18n } = useTranslation();
  const L = useLocalized();

  const title = L(course.title) || t("admin.training.create.fieldTitlePlaceholder");
  const instructor = getInstructor(course.instructorId);
  const steps = stepCount(course);
  const quizzes = quizCount(course);
  const questions = questionCount(course);
  const builderPath = `/admin/formations/${course.id}`;

  const menu: MenuAction[] = [
    { id: "builder", label: t("admin.training.actions.openBuilder"), icon: Wrench, onSelect: () => actions.onEdit(course) },
    { id: "preview", label: t("admin.training.actions.preview"), icon: Eye, onSelect: () => actions.onPreview(course) },
    { id: "review", label: t("admin.training.actions.review"), icon: CircleCheck, onSelect: () => actions.onReview(course) },
    { id: "duplicate", label: t("admin.training.actions.duplicate"), icon: Copy, onSelect: () => actions.onDuplicate(course) },
    ...(course.status === "published"
      ? [
          {
            id: "unpublish",
            label: t("admin.training.actions.unpublish"),
            icon: Upload,
            onSelect: () => actions.onUnpublish(course),
          } satisfies MenuAction,
        ]
      : []),
    {
      id: "delete",
      label: t("admin.training.actions.delete"),
      icon: Trash2,
      tone: "danger",
      separated: true,
      onSelect: () => actions.onDelete(course),
    },
  ];

  return (
    <article className="gt-admin-panel grid grid-rows-[auto_1fr_auto] overflow-hidden transition-[border-color,box-shadow] hover:border-[var(--gt-ink-400)] hover:shadow-[var(--shadow-sm)]">
      <div className="relative">
        <img
          src={course.cover}
          alt={t("admin.training.list.thumbAlt", { name: title })}
          className="aspect-[16/9] w-full object-cover"
        />
        <span className="absolute left-3 top-3">
          <StatusBadge status={course.status} size="sm" />
        </span>
      </div>

      <div className="grid content-start gap-3 p-4">
        <div className="grid gap-1">
          {/* The whole card is not a link: it carries its own actions, and a
              link wrapping buttons is invalid and unusable with a keyboard. */}
          <h3 className="text-[length:var(--text-h4)] leading-[var(--leading-snug)]">
            <Link
              to={builderPath}
              className="rounded-[2px] transition-colors hover:text-[var(--text-link-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              {title}
            </Link>
          </h3>
          <p className="m-0 line-clamp-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            {L(course.shortDescription)}
          </p>
        </div>

        <CountRow modules={course.modules.length} steps={steps} quizzes={quizzes} />

        <div className="flex flex-wrap items-center gap-1.5">
          <MetaPill>{t(`admin.training.level.${course.level}`)}</MetaPill>
          <MetaPill icon={Clock}>{formatDuration(course.duration, i18n.language)}</MetaPill>
          {questions > 0 && (
            <MetaPill icon={ListChecks}>{t("admin.training.list.questions", { count: questions })}</MetaPill>
          )}
        </div>

        {/* Completion is a number plus a bar plus a caption: the bar alone puts
            the meaning in length and colour, which is exactly what WCAG asks us
            not to do. */}
        <div className="grid gap-1.5 border-t border-[var(--border-subtle)] pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
              {t("admin.training.list.completion")}
            </span>
            <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
              {course.enrolled === 0 ? t("admin.training.list.noCompletion") : `${course.completionRate} %`}
            </span>
          </div>
          {course.enrolled > 0 && (
            <div
              role="progressbar"
              aria-valuenow={course.completionRate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${t("admin.training.list.completion")} — ${title}`}
              className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-sunken)]"
            >
              <span
                className="block h-full rounded-[var(--radius-pill)] bg-[var(--gt-emerald-400)]"
                style={{ width: `${course.completionRate}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--text-caption)] text-[var(--text-subtle)]">
            <span className="inline-flex items-center gap-1">
              <Users size={11} strokeWidth={2} aria-hidden="true" />
              {t("admin.training.list.learners", { count: course.enrolled })}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock size={11} strokeWidth={2} aria-hidden="true" />
              {t("admin.training.list.updated")}{" "}
              {new Date(course.updatedAt).toLocaleDateString(i18n.language, {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
            {instructor && <span>{instructor.name}</span>}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-3">
        <AdminButton variant="primary" size="sm" iconLeft={Wrench} onClick={() => actions.onEdit(course)}>
          {t("admin.training.actions.openBuilder")}
        </AdminButton>
        <AdminButton variant="outline" size="sm" iconLeft={Eye} onClick={() => actions.onPreview(course)}>
          {t("admin.training.actions.preview")}
        </AdminButton>
        <span className="flex-1" />
        <AdminButton
          variant="ghost"
          size="sm"
          iconLeft={Pencil}
          onClick={() => actions.onReview(course)}
          aria-label={`${t("admin.training.actions.review")} — ${title}`}
        >
          <span className="sr-only sm:not-sr-only">{t("admin.training.actions.review")}</span>
        </AdminButton>
        <OverflowMenu label={t("admin.training.actions.more", { name: title })} actions={menu} />
      </div>
    </article>
  );
}
