import { useTranslation } from "react-i18next";
import { Download, Expand, Lock } from "lucide-react";
import clsx from "clsx";
import { Button } from "../ui/Button";
import { ProgressBar } from "../ui/ProgressBar";
import { CertificateDocument } from "./CertificateDocument";
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

/** Collection numbering: "01", "02"… two digits is enough for a member's shelf. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * The frame around a rendered certificate: a mat border and a hairline, the way
 * a document is mounted rather than the way a card is filled. The document is
 * the only thing inside it, so the frame carries all the elevation.
 */
function DocumentFrame({
  course,
  holder,
  awardedOn,
  lang,
  className,
}: {
  course: Course;
  holder: string;
  awardedOn: string;
  lang: string;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "overflow-hidden rounded-[var(--radius-sm)] bg-[var(--gt-white)] p-[3%] shadow-[var(--shadow-inset-hairline),var(--shadow-sm)]",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[2px] shadow-[0_0_0_1px_var(--gt-ink-200)]">
        <CertificateDocument
          course={course}
          holder={holder}
          awardedOn={awardedOn}
          reference={certificateRef(course.id, awardedOn)}
          lang={lang}
        />
      </div>
    </div>
  );
}

interface EarnedProps {
  course: Course;
  progress: CourseProgress;
  holder: string;
  lang: string;
  /** Position in the collection and its size, for the archival numbering. */
  index: number;
  total: number;
  /** True for the most recent certificate, which gets the wide treatment. */
  featured?: boolean;
  onOpen: () => void;
  onDownload: () => void;
}

/**
 * One earned certificate. The document is the card: the frame, the numbering and
 * the metadata sit around it and never on top of it.
 *
 * Hover and focus only *emphasise* the actions — both are present at rest, so a
 * touch user is never left without them (AGENTS.md §11).
 */
export function CertificateCard({
  course,
  progress,
  holder,
  lang,
  index,
  total,
  featured = false,
  onOpen,
  onDownload,
}: EarnedProps) {
  const { t } = useTranslation();
  // The caller only renders this for completed courses, so the date is present.
  const awardedOn = progress.completedOn!;
  const reference = certificateRef(course.id, awardedOn);
  const title = pick(course.title, lang);

  const meta = (
    <div className="grid gap-[var(--space-3)]">
      <div className="flex items-center gap-2">
        <span
          className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-subtle)]"
          style={{ fontFamily: "var(--gt-font-mono)" }}
        >
          {pad2(index)} / {pad2(total)}
        </span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span className="gt-eyebrow text-[var(--accent-cta-ink)]">{t("account.certificateUnlocked")}</span>
      </div>

      <div className="grid gap-1.5">
        <h3 className={featured ? "text-[length:var(--text-h3)]" : "text-[length:var(--text-h4)]"}>{title}</h3>
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {t("account.certificateAwardedOn", { date: formatDate(awardedOn) })}
        </p>
        <p
          className="m-0 text-[11px] uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]"
          style={{ fontFamily: "var(--gt-font-mono)" }}
        >
          {reference}
        </p>
      </div>

      {featured && (
        <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {pick(course.copy, lang)}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="dark" size="sm" iconLeft={Expand} onClick={onOpen}>
          {t("account.certificateView")}
        </Button>
        <Button variant="outline" size="sm" iconLeft={Download} onClick={onDownload}>
          {t("account.certificateDownload")}
        </Button>
      </div>
    </div>
  );

  return (
    <article
      aria-label={t("account.certificateCardLabel", { index, total, title })}
      className={clsx(
        "group grid gap-[var(--space-5)] rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]",
        "transition-[transform,box-shadow,border-color] duration-[var(--duration-normal)] ease-[var(--ease-out-soft)]",
        "hover:-translate-y-[3px] hover:border-[var(--border-default)] hover:shadow-[var(--shadow-md)]",
        "focus-within:-translate-y-[3px] focus-within:border-[var(--border-default)] focus-within:shadow-[var(--shadow-md)]",
        featured && "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-center lg:gap-[var(--space-8)]",
      )}
    >
      <DocumentFrame
        course={course}
        holder={holder}
        awardedOn={awardedOn}
        lang={lang}
        className="transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out-soft)] group-hover:-translate-y-[2px] group-focus-within:-translate-y-[2px]"
      />
      {meta}
    </article>
  );
}

/**
 * A course still in progress: the certificate it will produce, shown as an empty
 * mount rather than as a failure. Kept from the previous card — the page has
 * always listed courses that have not reached 100 % yet.
 */
export function PendingCertificateCard({
  course,
  progress,
  lang,
}: {
  course: Course;
  progress: CourseProgress;
  lang: string;
}) {
  const { t } = useTranslation();
  const remaining = progress.total - progress.doneCount;

  return (
    <li className="grid content-start gap-[var(--space-4)] rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-5)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-subtle)]">
          <Lock size={16} aria-hidden="true" />
        </span>
        <div className="grid gap-1">
          <h3 className="text-[length:var(--text-h4)] text-[var(--text-body)]">{pick(course.title, lang)}</h3>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("account.certificateRemaining", { count: remaining })}
          </span>
        </div>
      </div>
      <ProgressBar
        value={progress.pct}
        size="sm"
        tone="brand"
        label={t("lesson.progressLabel", { done: progress.doneCount, total: progress.total })}
      />
    </li>
  );
}
