import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Lock, PenLine, ShieldCheck, Truck } from "lucide-react";
import { Button } from "../ui/Button";
import { ReviewStatusBadge } from "./ReviewBadges";
import { COURSE_REVIEW_THRESHOLD, type ReviewSubject } from "../../data/reviewSystem";
import { useReviewEligibility, useReviews } from "../../lib/reviews";

/**
 * The "Write a review" call to action, answering for the visitor looking at
 * it. Only an eligible customer gets the button; everyone else is told why
 * not, in a sentence, so the rule reads as a promise about the reviews
 * ("every review here comes from a real order") rather than as a locked door.
 */
export function WriteReviewPanel({ subject }: { subject: ReviewSubject }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const eligibility = useReviewEligibility();
  const { openForm, drafts } = useReviews();
  const e = eligibility(subject);
  const course = subject.kind === "course";

  const shell = (children: React.ReactNode) => (
    <div className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)]">{children}</div>
  );
  const note = (icon: React.ReactNode, text: string) => (
    <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
      <span aria-hidden="true" className="mt-0.5 flex-none">{icon}</span>
      {text}
    </p>
  );

  switch (e.state) {
    case "eligible":
      return shell(
        <>
          <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
            {t(course ? "reviews.cta.eligibleCourse" : "reviews.cta.eligibleProduct")}
          </strong>
          {note(<ShieldCheck size={14} />, t(course ? "reviews.cta.eligibleCourseNote" : "reviews.cta.eligibleProductNote"))}
          <Button variant="primary" size="md" iconLeft={PenLine} onClick={() => openForm({ subject })} fullWidth>
            {drafts[`${subject.kind}:${subject.id}`] ? t("reviews.request.resume") : t("reviews.cta.write")}
          </Button>
        </>,
      );
    case "reviewed": {
      const r = e.review;
      const editable = r.status !== "pending";
      return shell(
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">{t("reviews.cta.yours")}</strong>
            <ReviewStatusBadge status={r.status} audience="customer" />
          </div>
          <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t(`reviews.mine.explain.${r.status}`)}</p>
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Button variant="outline" size="sm" iconLeft={PenLine} onClick={() => openForm({ subject, reviewId: r.id })}>
                {t("reviews.mine.edit")}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate("/compte/avis")}>{t("reviews.form.viewMine")}</Button>
          </div>
        </>,
      );
    }
    case "signedOut":
      return shell(
        <>
          <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
            {t(course ? "reviews.cta.signedOutCourse" : "reviews.cta.signedOutProduct")}
          </strong>
          {note(<ShieldCheck size={14} />, t("reviews.cta.verifiedOnly"))}
          <Button variant="outline" size="sm" onClick={() => navigate("/connexion", { state: { from: location.pathname } })}>
            {t("reviews.cta.signIn")}
          </Button>
        </>,
      );
    case "awaitingShipment":
      return shell(note(<Truck size={14} />, t("reviews.cta.awaitingShipment", { ref: e.orderRef })));
    case "needsProgress":
      return shell(
        <>
          {note(<Lock size={14} />, t("reviews.cta.needsProgress", { threshold: COURSE_REVIEW_THRESHOLD, pct: e.pct }))}
          <div
            role="progressbar"
            aria-label={t("reviews.cta.progressLabel")}
            aria-valuenow={e.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="relative h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
          >
            <span className="block h-full rounded-full bg-[var(--gt-emerald-400)]" style={{ width: `${e.pct}%` }} />
            <span aria-hidden="true" className="absolute inset-y-0 w-px bg-[var(--gt-ink-900)]" style={{ left: `${COURSE_REVIEW_THRESHOLD}%` }} />
          </div>
        </>,
      );
    default:
      return shell(note(<ShieldCheck size={14} />, t(course ? "reviews.cta.notStudent" : "reviews.cta.notCustomer")));
  }
}
