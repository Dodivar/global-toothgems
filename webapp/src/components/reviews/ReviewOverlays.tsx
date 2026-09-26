import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Flag, X } from "lucide-react";
import clsx from "clsx";
import { Dialog } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { ReviewFormDialog } from "./ReviewFormDialog";
import { REPORT_REASONS, type ReportReason } from "../../data/reviewSystem";
import { useReviewAuthor, useReviews } from "../../lib/reviews";
import { useToast } from "../../lib/toast";
import { useFocusTrap } from "../../lib/useFocusTrap";

/**
 * The review system's three overlays, mounted once in `App.tsx`.
 *
 * Any screen opens them through the store (`openForm`, `openReport`,
 * `openPhotos`) rather than rendering its own copy, so a product page, the
 * dashboard and "My reviews" share one form with one draft and one success
 * state.
 */
export function ReviewOverlays() {
  return (
    <>
      <ReviewFormDialog />
      <ReportDialog />
      <PhotoViewer />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

function ReportDialog() {
  const { reportTarget, closeReport } = useReviews();
  if (!reportTarget) return null;
  return <ReportDialogBody key={reportTarget} id={reportTarget} onClose={closeReport} />;
}

/**
 * Reporting is discreet on the card and deliberate here: a reason is
 * required, details are optional, and the dialog says plainly what happens
 * next — the review is looked at by a person, and is not removed
 * automatically.
 */
function ReportDialogBody({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { getReview, reportReview } = useReviews();
  const { showToast } = useToast();
  const authorOf = useReviewAuthor();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [tried, setTried] = useState(false);
  const detailsId = useId();
  const errorId = useId();
  const review = getReview(id);
  if (!review) return null;

  const send = () => {
    setTried(true);
    if (!reason) return;
    reportReview(id, reason, details);
    onClose();
    showToast(t("reviews.report.sentTitle"), t("reviews.report.sentBody"), "info");
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("reviews.report.title")}
      description={t("reviews.report.description", { name: authorOf(review) })}
      icon={<Flag size={17} />}
      closeLabel={t("reviews.form.close")}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>{t("reviews.form.cancel")}</Button>
          <Button variant="dark" size="sm" onClick={send}>{t("reviews.report.send")}</Button>
        </div>
      }
    >
      <fieldset className="m-0 grid gap-2 border-0 p-0" aria-describedby={tried && !reason ? errorId : undefined}>
        <legend className="gt-field-label mb-2 p-0">{t("reviews.report.reasonLabel")}</legend>
        {REPORT_REASONS.map((r) => (
          <label
            key={r}
            className={clsx(
              "flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-[length:var(--text-body-sm)] transition-colors",
              "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--focus-ring)]",
              reason === r ? "border-[var(--gt-ink-900)] bg-[var(--gt-ink-100)] font-semibold text-[var(--text-primary)]" : "border-[var(--border-subtle)] text-[var(--text-body)] hover:border-[var(--border-default)]",
            )}
          >
            <input type="radio" name="gt-report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--gt-ink-900)]" />
            {t(`reviews.reportReasons.${r}`)}
          </label>
        ))}
        {tried && !reason && (
          <span id={errorId} role="alert" className="text-[length:var(--text-caption)] font-semibold text-[var(--status-error-fg)]">
            {t("reviews.report.reasonRequired")}
          </span>
        )}
      </fieldset>
      <div className="grid gap-1.5">
        <label htmlFor={detailsId} className="gt-field-label">
          {t("reviews.report.detailsLabel")} <span className="font-normal normal-case tracking-normal text-[var(--text-subtle)]">· {t("reviews.form.optional")}</span>
        </label>
        <textarea id={detailsId} rows={3} maxLength={500} className="gt-field h-auto min-h-[88px] rounded-[var(--radius-lg)] py-3" value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
      <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("reviews.report.note")}</p>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Photo viewer                                                               */
/* -------------------------------------------------------------------------- */

function PhotoViewer() {
  const { photoTarget, closePhotos } = useReviews();
  if (!photoTarget) return null;
  return <PhotoViewerBody key={photoTarget.photos[0]?.src} onClose={closePhotos} />;
}

/**
 * Customer photos at full size. Arrow keys move between photos, Escape
 * closes; the customer's own description is printed under each one, so the
 * text alternative is useful to everyone, not only to screen readers.
 */
function PhotoViewerBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { photoTarget } = useReviews();
  const [index, setIndex] = useState(photoTarget?.index ?? 0);
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  const titleId = useId();
  const photos = photoTarget?.photos ?? [];
  const count = photos.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count]);

  if (!photoTarget || count === 0) return null;
  const photo = photos[index];
  const alt = photo.alt || photoTarget.caption;
  const nav = "gt-glass grid h-11 w-11 place-items-center rounded-full text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <div className="fixed inset-0 z-[520] grid place-items-center p-4 sm:p-8">
      <div aria-hidden="true" onClick={onClose} className="gt-admin-scrim fixed inset-0 bg-[rgba(17,17,17,.82)] backdrop-blur-[6px]" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="relative grid w-full max-w-[880px] gap-3 outline-none">
        <div className="flex items-center justify-between gap-3 text-[var(--gt-off-white)]">
          <h2 id={titleId} className="text-[length:var(--text-body-sm)] font-semibold text-[var(--gt-off-white)]">
            {photoTarget.caption}
            {count > 1 && <span className="ml-2 font-normal text-[var(--gt-ink-300)] tabular-nums">{t("reviews.photos.position", { index: index + 1, total: count })}</span>}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("reviews.form.close")} className={nav}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <figure className="m-0 grid gap-3">
          <img
            key={photo.src}
            src={photo.src}
            alt={alt}
            className="gt-pop-in max-h-[72vh] w-full rounded-[var(--radius-lg)] object-contain"
          />
          {photo.alt && <figcaption className="text-center text-[length:var(--text-caption)] text-[var(--gt-ink-300)]">{photo.alt}</figcaption>}
        </figure>
        {count > 1 && (
          <div className="flex justify-center gap-3">
            <button type="button" onClick={() => setIndex((i) => (i - 1 + count) % count)} aria-label={t("reviews.photos.previous")} className={nav}>
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setIndex((i) => (i + 1) % count)} aria-label={t("reviews.photos.next")} className={nav}>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
