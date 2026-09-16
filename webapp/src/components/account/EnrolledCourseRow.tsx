import { useTranslation } from "react-i18next";
import { ArrowRight, Check } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import type { Course } from "../../data/courses";
import { MODULES, MODULE_OFFSETS } from "../../data/lessons";
import { pick } from "../../data/types";
import type { CourseProgress } from "../../lib/progress";
import { formatDate } from "../../lib/format";

/** Per-module completion for one course, from its single `doneCount`. */
function ModuleBreakdown({ doneCount, lang }: { doneCount: number; lang: string }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {MODULES.map((module, i) => {
        const total = module.lessons.length;
        const done = Math.max(0, Math.min(total, doneCount - MODULE_OFFSETS[i]));
        const complete = done === total;
        return (
          <li
            key={module.title.fr}
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
              {done}/{total}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** One course on the account, with its progression and per-module map. */
export function EnrolledCourseRow({
  course,
  progress,
  lang,
  onOpen,
}: {
  course: Course;
  progress: CourseProgress;
  lang: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="grid grid-cols-1 gap-4 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)] sm:grid-cols-[132px_minmax(0,1fr)]">
      <div className="relative aspect-video overflow-hidden rounded-[var(--radius-md)] bg-[var(--surface-sunken)] sm:aspect-square">
        <img src={course.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </div>
      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <h3 className="text-[length:var(--text-h4)]">{pick(course.title, lang)}</h3>
            <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
              {pick(course.level, lang)} · {t("course.lessonCount", { count: progress.total })} · {course.duration}
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

        <ModuleBreakdown doneCount={progress.doneCount} lang={lang} />

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
