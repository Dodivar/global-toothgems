import { useTranslation } from "react-i18next";
import { Expand, Lock, Share2 } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import type { TFunction } from "i18next";
import { CertificateSheet, useCertificateContent, type CertificateCourse } from "./CertificateDocument";
import { AchievementBadge, CertificateStatus } from "../certificate/Achievement";
import { DownloadCertificateButton } from "../certificate/DownloadCertificateButton";
import { ShareAchievementDialog } from "../certificate/ShareAchievementDialog";
import { pick } from "../../data/types";
import type { CourseProgress, LearnerCourseCard } from "../../lib/progress";
import { useCertificateExport } from "../../lib/certificate/useCertificateExport";
import { useFormat } from "../../lib/format";
import { useToast } from "../../lib/toast";
import { formatDuration } from "../../lib/trainingFilters";

/**
 * Certificate reference shown on an unlocked attestation: the verification
 * code the server issued with the completion record (`course_completions`).
 * The prototype (mock mode) has no server, so it derives one from the course
 * and the award date.
 */
export function certificateRef(course: LearnerCourseCard, progress: CourseProgress): string {
  return progress.certificateCode ?? sampleCertificateRef(course.id, progress.completedOn ?? "");
}

/**
 * A reference in the certificate's format (`GTC-XXXX-XXXX-XXXX`), for the
 * prototype and the sales page's sample diploma: a stable hash of the course
 * and the date, so it never changes between renders.
 */
export function sampleCertificateRef(courseId: string, awardedOn: string): string {
  let hash = 0x811c9dc5;
  const hex: string[] = [];
  for (let round = 0; round < 3; round++) {
    for (const ch of `${courseId}|${awardedOn.slice(0, 10)}|${round}`) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hex.push((hash & 0xffff).toString(16).toUpperCase().padStart(4, "0"));
  }
  return `GTC-${hex.join("-")}`;
}

/**
 * What the certificate prints about a held course, in the page's language. A
 * withdrawn course has no content to count (its certificate outlives it): the
 * lesson count is then left out and the advertised length is printed.
 */
export function certificateCourse(course: LearnerCourseCard, progress: CourseProgress, lang: string, t: TFunction): CertificateCourse {
  const minutes = progress.totalMinutes || course.minutes;
  return {
    title: course.title,
    level: t(`academy.levels.${course.level}`),
    lessonCount: progress.total,
    duration: minutes > 0 ? formatDuration(minutes, lang) : "",
  };
}

/** The certificate of one held course, ready to draw and to export. */
export function useHeldCertificate(course: LearnerCourseCard, progress: CourseProgress, holder: string, lang: string) {
  const { t } = useTranslation();
  // Callers only use this for completed courses, so the date is present.
  const awardedOn = progress.completedOn!;
  const content = useCertificateContent({
    course: certificateCourse(course, progress, lang, t),
    holder,
    awardedOn,
    reference: certificateRef(course, progress),
    lang,
  });
  return { content, awardedOn };
}

/** Collection numbering: "01", "02"… two digits is enough for a member's shelf. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

interface EarnedProps {
  course: LearnerCourseCard;
  progress: CourseProgress;
  holder: string;
  lang: string;
  /** Position in the collection and its size, for the archival numbering. */
  index: number;
  total: number;
  /** True for the most recent certificate, which gets the wide treatment. */
  featured?: boolean;
  onOpen: () => void;
  onShare: () => void;
}

/**
 * One earned certificate: the document mounted like a print, and around it —
 * never on top of it — the status, the badge, the reference and the three
 * things to do with it (view, download, share).
 *
 * Hover and focus only *emphasise*: the card lifts and the actions are there
 * at rest, so a touch user is never left without them (AGENTS.md §11).
 */
export function CertificateCard({ course, progress, holder, lang, index, total, featured = false, onOpen, onShare }: EarnedProps) {
  const { formatDate } = useFormat();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { content, awardedOn } = useHeldCertificate(course, progress, holder, lang);
  const { status, download } = useCertificateExport(content);
  const title = pick(course.title, lang);

  const onDownload = () =>
    void download("pdf").then((ok) =>
      ok
        ? showToast(t("certificate.downloadDoneLive"), t("certificate.downloadDoneBody"), "success")
        : showToast(t("certificate.downloadError"), undefined, "error"),
    );

  return (
    <article
      aria-label={t("account.certificateCardLabel", { index, total, title })}
      className={clsx(
        "group relative grid gap-[var(--space-5)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]",
        "transition-[transform,box-shadow,border-color] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        "hover:-translate-y-[3px] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-md)]",
        "focus-within:-translate-y-[3px] focus-within:border-[var(--border-default)] focus-within:shadow-[var(--shadow-md)]",
        "motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0",
        featured && "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center lg:gap-[var(--space-8)] lg:p-[var(--space-6)]",
      )}
    >
      {/* A wash behind the featured print, so it reads as the newest on the shelf. */}
      {featured && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(90%_70%_at_0%_0%,var(--gt-blue-100),transparent_60%),radial-gradient(60%_60%_at_100%_100%,var(--gt-emerald-50),transparent_70%)]" />
      )}

      <button
        type="button"
        onClick={onOpen}
        aria-label={t("certificate.viewAria", { title })}
        className="relative block overflow-hidden rounded-[var(--radius-sm)] bg-[var(--gt-white)] p-[3%] text-left shadow-[var(--shadow-inset-hairline),var(--shadow-sm)] transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover:-translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
      >
        <span className="block overflow-hidden rounded-[2px] shadow-[0_0_0_1px_var(--gt-ink-200)]">
          <CertificateSheet content={content} />
        </span>
      </button>

      <div className="relative grid gap-[var(--space-4)]">
        <div className="flex items-center gap-3">
          <AchievementBadge size="sm" />
          <div className="grid gap-1">
            <CertificateStatus state="earned" />
            <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-subtle)]" style={{ fontFamily: "var(--gt-font-mono)" }}>
              {pad2(index)} / {pad2(total)}
            </span>
          </div>
        </div>

        <div className="grid gap-1.5">
          <h3 className={featured ? "text-[length:var(--text-h3)]" : "text-[length:var(--text-h4)]"}>{title}</h3>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("account.certificateAwardedOn", { date: formatDate(awardedOn) })}
          </p>
          <p className="m-0 text-[11px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]" style={{ fontFamily: "var(--gt-font-mono)" }}>
            <span className="sr-only">{t("account.certificateMetaRef")} </span>
            {content.reference}
          </p>
        </div>

        {featured && <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{pick(course.summary, lang)}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <DownloadCertificateButton status={status.pdf} onDownload={onDownload} size="sm" variant="primary" label={t("account.certificateDownload")} />
          <Button variant="dark" size="sm" iconLeft={Share2} className="gt-cert-cta" onClick={onShare}>
            {t("certificate.shareShort")}
          </Button>
          <Button variant="ghost" size="sm" iconLeft={Expand} onClick={onOpen}>
            {t("account.certificateView")}
          </Button>
        </div>
      </div>
    </article>
  );
}

/** The share dialog for one held course's certificate. */
export function HeldCertificateShare({
  course,
  progress,
  holder,
  lang,
  onClose,
}: {
  course: LearnerCourseCard;
  progress: CourseProgress;
  holder: string;
  lang: string;
  onClose: () => void;
}) {
  const { content, awardedOn } = useHeldCertificate(course, progress, holder, lang);
  return <ShareAchievementDialog content={content} awardedOn={awardedOn} onClose={onClose} />;
}

/**
 * A course still in progress: the certificate it will produce, shown as a
 * locked mount rather than as a failure, with how far along it is (a bar, a
 * number and a word — never colour alone).
 */
export function PendingCertificateCard({ course, progress, lang, onContinue }: { course: LearnerCourseCard; progress: CourseProgress; lang: string; onContinue: () => void }) {
  const { t } = useTranslation();
  const remaining = progress.total - progress.doneCount;

  return (
    <li className="grid content-start gap-[var(--space-4)] rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] bg-[var(--surface-card)] p-[var(--space-5)]">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-dashed border-[var(--border-default)] bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
          <Lock size={16} aria-hidden="true" />
        </span>
        <div className="grid gap-1.5">
          <CertificateStatus state="pending" pct={progress.pct} />
          <h3 className="text-[length:var(--text-h4)] text-[var(--text-body)]">{pick(course.title, lang)}</h3>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("account.certificateRemaining", { count: remaining })}</span>
        </div>
      </div>
      <ProgressBar value={progress.pct} size="sm" tone="brand" label={t("lesson.progressLabel", { done: progress.doneCount, total: progress.total })} />
      <div>
        <Button variant="outline" size="sm" onClick={onContinue}>
          {t("certificate.pendingCta")}
        </Button>
      </div>
    </li>
  );
}
