import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Copy, Share2, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { CertificateSheet } from "./CertificateDocument";
import { certificateCourse, useHeldCertificate } from "./CertificateCard";
import { AchievementBadge, CertificateStatus } from "../certificate/Achievement";
import { DownloadCertificateButton } from "../certificate/DownloadCertificateButton";
import { useNativeDialog } from "../certificate/useNativeDialog";
import { pick } from "../../data/types";
import { useCertificateExport } from "../../lib/certificate/useCertificateExport";
import type { CourseProgress, LearnerCourseCard } from "../../lib/progress";
import { useFormat } from "../../lib/format";

/** Zoom steps of the page, as a share of the stage's width. */
const ZOOMS = [1, 1.5, 2] as const;

/**
 * Full-size view of one certificate: the document as the hero, nothing else
 * competing with it.
 *
 * The stage zooms in steps (the page grows and the stage scrolls), the side
 * panel holds the details and every action — download as PDF or image, share,
 * copy the reference — and "Back to my certificates" closes it. Confirmations
 * are spoken from inside the dialog: a toast would sit behind the modal.
 *
 * Native `<dialog>` (`useNativeDialog`): the share dialog opens above it.
 * Mounted only while a certificate is selected.
 */
export function CertificateViewer({
  course,
  progress,
  holder,
  lang,
  onClose,
  onShare,
}: {
  course: LearnerCourseCard;
  progress: CourseProgress;
  holder: string;
  lang: string;
  onClose: () => void;
  onShare: () => void;
}) {
  const { formatDate } = useFormat();
  const { t } = useTranslation();
  const titleId = useId();
  const { dialogProps, close } = useNativeDialog(onClose);
  const { content, awardedOn } = useHeldCertificate(course, progress, holder, lang);
  const { status, download } = useCertificateExport(content);
  const [zoom, setZoom] = useState(0);
  const [copied, setCopied] = useState<"done" | "error" | null>(null);
  const printed = certificateCourse(course, progress, lang, t);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyReference = async () => {
    try {
      await navigator.clipboard.writeText(content.reference);
      setCopied("done");
    } catch {
      setCopied("error");
    }
  };

  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: t("account.certificateMetaCourse"), value: pick(course.title, lang) },
    { label: t("certificate.metaHolder"), value: holder },
    { label: t("account.certificateMetaLevel"), value: String(printed.level) },
    {
      label: t("account.certificateMetaLessons"),
      value: [progress.total > 0 ? t("course.lessonCount", { count: progress.total }) : "", printed.duration].filter(Boolean).join(" · ") || "—",
    },
    ...(progress.quizAverage !== null ? [{ label: t("learning.stats.average"), value: `${progress.quizAverage} %` }] : []),
    { label: t("account.certificateMetaDate"), value: formatDate(awardedOn) },
    { label: t("account.certificateMetaRef"), value: content.reference, mono: true },
  ];

  return (
    <dialog
      {...dialogProps}
      aria-labelledby={titleId}
      className="m-auto max-h-[calc(100dvh-24px)] w-[min(1180px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[var(--radius-card)] border-0 bg-transparent p-0 backdrop:bg-[rgba(17,17,17,.62)] backdrop:backdrop-blur-[3px]"
    >
      <div className="gt-cert-rise grid gap-[var(--space-5)] rounded-[var(--radius-card)] bg-[var(--surface-card)] p-[clamp(14px,3vw,32px)] text-[var(--text-body)] shadow-[var(--shadow-lg)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <AchievementBadge size="sm" />
            <div className="grid gap-1">
              <CertificateStatus state="earned" />
              <h2 id={titleId} className="text-[length:var(--text-h4)] sm:text-[length:var(--text-h3)]">
                {pick(course.title, lang)}
              </h2>
            </div>
          </div>
          <IconButton icon={X} label={t("common.close")} variant="outline" size="sm" onClick={close} />
        </div>

        <div className="grid gap-[var(--space-5)] lg:grid-cols-[minmax(0,1.7fr)_minmax(260px,1fr)] lg:items-start lg:gap-[var(--space-7,28px)]">
          {/* The stage: the certificate, zoomable, on a soft brand wash. */}
          <div className="grid gap-2">
            <div
              tabIndex={zoom > 0 ? 0 : -1}
              aria-label={zoom > 0 ? t("certificate.stageLabel") : undefined}
              role={zoom > 0 ? "region" : undefined}
              className="max-h-[min(72dvh,760px)] overflow-auto rounded-[var(--radius-md)] bg-[linear-gradient(135deg,var(--gt-blue-100),var(--gt-blue-50)_45%,var(--gt-emerald-50))] p-[clamp(10px,2.5vw,28px)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              <div className="gt-cert-zoom mx-auto" style={{ width: `${ZOOMS[zoom] * 100}%` }}>
                <div className="overflow-hidden rounded-[var(--radius-sm)] bg-[var(--gt-white)] p-[2%] shadow-[var(--shadow-lg)]">
                  <div className="overflow-hidden rounded-[2px] shadow-[0_0_0_1px_var(--gt-ink-200)]">
                    <CertificateSheet content={content} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-1.5" role="group" aria-label={t("certificate.zoomGroup")}>
              <IconButton icon={ZoomOut} label={t("certificate.zoomOut")} variant="outline" size="sm" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))} />
              <span aria-live="polite" className="min-w-[56px] text-center text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-muted)]">
                {Math.round(ZOOMS[zoom] * 100)} %
              </span>
              <IconButton icon={ZoomIn} label={t("certificate.zoomIn")} variant="outline" size="sm" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))} />
            </div>
          </div>

          <div className="grid content-start gap-[var(--space-5)]">
            <div className="grid gap-2">
              <DownloadCertificateButton status={status.pdf} onDownload={() => void download("pdf")} fullWidth />
              <div className="grid grid-cols-2 gap-2">
                <DownloadCertificateButton status={status.png} onDownload={() => void download("png")} format="png" variant="outline" size="sm" fullWidth label={t("certificate.imageShort")} />
                <Button variant="dark" size="sm" iconLeft={Share2} fullWidth className="gt-cert-cta" onClick={onShare}>
                  {t("certificate.shareShort")}
                </Button>
              </div>
            </div>

            <dl className="m-0 grid gap-3">
              {rows.map((row) => (
                <div key={row.label} className="grid gap-0.5 border-b border-[var(--border-subtle)] pb-3 last:border-0 last:pb-0">
                  <dt className="gt-eyebrow">{row.label}</dt>
                  <dd className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-primary)]" style={row.mono ? { fontFamily: "var(--gt-font-mono)" } : undefined}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="grid gap-1.5">
              <Button variant="ghost" size="sm" iconLeft={copied === "done" ? Check : Copy} onClick={copyReference} className="justify-self-start">
                {copied === "done" ? t("certificate.refCopied") : t("certificate.copyRef")}
              </Button>
              <span role="status" aria-live="polite" className={copied === "error" ? "text-[length:var(--text-caption)] text-[var(--status-error-fg)]" : "sr-only"}>
                {copied === "done" ? t("certificate.refCopied") : copied === "error" ? t("certificate.shareCopyFailed") : ""}
              </span>
              <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-subtle)]">{t("certificate.refNote")}</p>
            </div>

            <Button variant="outline" size="sm" iconLeft={ArrowLeft} onClick={close} className="justify-self-start">
              {t("certificate.backToCollection")}
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
