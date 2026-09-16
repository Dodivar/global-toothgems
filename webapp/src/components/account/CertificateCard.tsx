import { useTranslation } from "react-i18next";
import { Award, BadgeCheck, Download, Lock } from "lucide-react";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import type { Course } from "../../data/courses";
import { pick } from "../../data/types";
import type { CourseProgress } from "../../lib/progress";
import { formatDate } from "../../lib/format";

/**
 * Certificate reference shown on an unlocked attestation. Derived from the
 * course and the award date rather than stored, for the same reason the
 * unlocked state itself is derived from progress reaching 100 %.
 */
export function certificateRef(courseId: string, awardedOn: string): string {
  return `GT-${courseId.toUpperCase()}-${awardedOn.slice(0, 4)}-${awardedOn.slice(5, 7)}`;
}

export function CertificateCard({
  course,
  progress,
  lang,
  onDownload,
}: {
  course: Course;
  progress: CourseProgress;
  lang: string;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const unlocked = progress.completed && progress.completedOn !== null;

  if (!unlocked) {
    const remaining = progress.total - progress.doneCount;
    return (
      <article className="grid content-start gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-5)]">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
          <Lock size={18} aria-hidden="true" />
        </span>
        <div className="grid gap-1">
          <h3 className="text-[length:var(--text-h4)] text-[var(--text-muted)]">{pick(course.title, lang)}</h3>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("account.certificateRemaining", { count: remaining })}
          </span>
        </div>
        <ProgressBar value={progress.pct} size="sm" tone="brand" showValue={false} />
      </article>
    );
  }

  return (
    <article className="relative grid content-start gap-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-inverse)] p-[var(--space-5)] text-[var(--text-inverse)]">
      {/* Faint seal behind the card: the certificate's only ornament. */}
      <Award
        size={132}
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 text-white/[.07]"
        strokeWidth={1}
      />
      <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gt-emerald-400)] text-[var(--gt-ink-900)]">
        <BadgeCheck size={20} aria-hidden="true" />
      </span>
      <div className="relative grid gap-1">
        <span className="text-[length:var(--text-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--gt-blue-300)]">
          {t("account.certificateUnlocked")}
        </span>
        <h3 className="text-[length:var(--text-h4)] text-[var(--gt-off-white)]">{pick(course.title, lang)}</h3>
        <span className="text-[length:var(--text-caption)] text-[var(--gt-ink-300)]">
          {t("account.certificateAwardedOn", { date: formatDate(progress.completedOn!) })}
        </span>
        <span className="text-[11px] text-[var(--gt-ink-400)]" style={{ fontFamily: "var(--gt-font-mono)" }}>
          {certificateRef(course.id, progress.completedOn!)}
        </span>
      </div>
      <div className="relative">
        <Button variant="glass" size="sm" iconLeft={Download} onClick={onDownload}>
          {t("account.certificateDownload")}
        </Button>
      </div>
    </article>
  );
}
