import { useTranslation } from "react-i18next";
import { ArrowRight, PlayCircle } from "lucide-react";
import { Button } from "../../ui/Button";
import { pick, type Localized } from "../../../data/types";
import type { CourseProgress } from "../../../lib/progress";

/**
 * The lesson to resume — the dashboard's most useful control while a course
 * is open, so it keeps the dark treatment. On a phone the cover sits above the
 * text, the button full width under it.
 */
export function ResumeCourseCard({
  title,
  cover,
  moduleTitle,
  progress,
  onResume,
}: {
  title: Localized;
  cover: string;
  moduleTitle: Localized | null;
  progress: CourseProgress;
  onResume: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <section
      aria-label={t("account.resumeEyebrow")}
      className="grid grid-cols-1 gap-5 rounded-[var(--radius-card)] bg-[var(--surface-inverse)] p-[var(--space-5)] text-[var(--text-inverse)] sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]"
    >
      <div className="relative aspect-video overflow-hidden rounded-[var(--radius-md)] bg-white/5">
        {cover && <img src={cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}
        <span className="absolute inset-0 grid place-items-center text-white/90">
          <PlayCircle size={40} strokeWidth={1.5} aria-hidden="true" />
        </span>
      </div>
      <div className="grid content-center gap-3">
        <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
          {t("account.resumeEyebrow")}
        </span>
        <h2 className="m-0 text-[length:var(--text-h4)] text-[var(--gt-off-white)]">
          {t("account.resumeLesson", {
            number: progress.activeIdx + 1,
            title: progress.current ? pick(progress.current.title, lang) : "",
          })}
        </h2>
        <span className="text-[length:var(--text-body-sm)] text-[var(--gt-ink-300)]">
          {pick(title, lang)} · {moduleTitle && `${pick(moduleTitle, lang)} · `}
          {t("account.resumeRemaining", { minutes: progress.remainingMinutes })}
        </span>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.pct}
          aria-label={t("lesson.progressLabel", { done: progress.doneCount, total: progress.total })}
          className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-white/15"
        >
          <div className="h-full rounded-[var(--radius-pill)] bg-[var(--accent-cta)]" style={{ width: `${progress.pct}%` }} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" iconRight={ArrowRight} onClick={onResume} className="w-full sm:w-auto">
            {t("account.resumeCta")}
          </Button>
          <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--gt-ink-300)]">
            {t("lesson.progressLabel", { done: progress.doneCount, total: progress.total })} · {progress.pct}%
          </span>
        </div>
      </div>
    </section>
  );
}
