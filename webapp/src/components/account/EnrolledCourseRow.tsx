import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Sunrise } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { pick } from "../../data/types";
import { useCourseMediaUrl, type CourseProgress, type LearnerCourseCard } from "../../lib/progress";
import { useFormat } from "../../lib/format";
import { formatDuration } from "../../lib/trainingFilters";

/** Per-module completion for one course, as the authored modules stand. */
function ModuleBreakdown({ modules, lang }: { modules: CourseProgress["modules"]; lang: string }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {modules.map((module) => {
        const complete = module.status === "completed";
        return (
          <li
            key={module.id}
            className="flex items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[11px] font-medium"
            style={{
              borderColor: complete ? "var(--gt-emerald-300)" : "var(--border-subtle)",
              background: complete ? "var(--status-success-bg)" : "transparent",
              color: complete ? "var(--status-success-fg)" : "var(--text-muted)",
            }}
          >
            {complete && <Check size={11} strokeWidth={3} aria-hidden="true" />}
            <span>{pick(module.title, lang)}</span>
            <span className="tabular-nums">
              {module.done}/{module.total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One course on the account, with its progression and per-module map. A
 * withdrawn course (owner, 2026-10-01) stays listed, greyed out, with a
 * "back soon" message and nothing to open: its content is not served.
 */
export function EnrolledCourseRow({
  course,
  progress,
  lang,
  onOpen,
}: {
  course: LearnerCourseCard;
  progress: CourseProgress;
  lang: string;
  onOpen: () => void;
}) {
  const { formatDate } = useFormat();
  const { t } = useTranslation();
  const mediaUrl = useCourseMediaUrl();
  const image = mediaUrl(course.cover);
  const level = t(`academy.levels.${course.level}`);
  const withdrawn = course.status === "unpublished";

  if (withdrawn) {
    return (
      <li
        aria-disabled="true"
        className="grid grid-cols-1 gap-4 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] p-[var(--space-5)] sm:grid-cols-[132px_minmax(0,1fr)]"
      >
        <div className="relative aspect-video overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)] sm:aspect-square">
          {image && <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-50 grayscale" />}
        </div>
        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-1">
              <h3 className="text-[length:var(--text-h4)] text-[var(--text-muted)]">{pick(course.title, lang)}</h3>
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{level}</span>
            </div>
            <Badge tone="neutral" size="sm">
              {t("account.courseBackSoonBadge")}
            </Badge>
          </div>
          <p className="m-0 flex items-start gap-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
            <Sunrise size={16} aria-hidden="true" className="mt-0.5 flex-none" />
            {t("account.courseBackSoon")}
          </p>
        </div>
      </li>
    );
  }

  return (
    <li className="grid grid-cols-1 gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)] sm:grid-cols-[132px_minmax(0,1fr)]">
      <div className="relative aspect-video overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)] sm:aspect-square">
        {image && <img src={image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
      </div>
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <h3 className="text-[length:var(--text-h4)]">{pick(course.title, lang)}</h3>
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {level} · {t("course.lessonCount", { count: progress.total })} · {formatDuration(progress.totalMinutes, lang)}
            </span>
          </div>
          <Badge tone={progress.completed ? "success" : "brand"} size="sm">
            {t(progress.completed ? "course.stateCompleted" : "course.stateEnrolled")}
          </Badge>
        </div>

        <ProgressBar
          value={progress.pct}
          size="sm"
          tone={progress.completed ? "emerald" : "brand"}
          label={t("lesson.progressLabel", { done: progress.doneCount, total: progress.total })}
        />

        <ModuleBreakdown modules={progress.modules} lang={lang} />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant={progress.completed ? "outline" : "dark"} size="sm" iconRight={ArrowRight} onClick={onOpen}>
            {t(progress.completed ? "account.courseReview" : "account.courseContinue")}
          </Button>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {progress.completed && progress.completedOn
              ? t("account.courseCompletedOn", { date: formatDate(progress.completedOn) })
              : t("account.courseRemaining", { minutes: progress.remainingMinutes })}
          </span>
        </div>
      </div>
    </li>
  );
}
