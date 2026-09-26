import { useTranslation } from "react-i18next";
import { EyeOff, Flag, Search, ShieldCheck, ShieldQuestion, XCircle } from "lucide-react";
import { AdminButton } from "../../admin/AdminButton";
import { EmptyState } from "../../admin/EmptyState";
import { Stars } from "../Stars";
import { ReviewStatusBadge, VerifiedBadge } from "../ReviewBadges";
import { openReports, privacyName, type CustomerReview, type ReportReason } from "../../../data/reviewSystem";
import { subjectName, useReviewCustomer, useReviews } from "../../../lib/reviews";
import { useWhen } from "./ModerationSheet";
import type { DialogAction } from "./ModerationDialogs";

/**
 * Reported reviews, worked one at a time.
 *
 * Each card puts the review beside what was said about it, grouped by reason,
 * and the three possible outcomes. None of them is automatic and none deletes
 * anything; "Investigate" opens the full panel with the customer and the
 * order. Below, what was decided recently, so a second report on a review
 * already kept is judged with that context.
 */
export function ReportedReviews({ onOpen, onAction }: { onOpen: (id: string) => void; onAction: (kind: DialogAction, id: string) => void }) {
  const { t } = useTranslation();
  const { reviews, loading } = useReviews();

  const open = reviews
    .filter((r) => openReports(r).length > 0)
    .sort((a, b) => openReports(b).length - openReports(a).length);
  const resolved = reviews
    .filter((r) => r.reports.length > 0 && openReports(r).length === 0)
    .slice(0, 6);

  if (loading) {
    return (
      <div className="grid gap-3" role="status">
        <span className="sr-only">{t("reviews.section.loading")}</span>
        {[0, 1].map((i) => <div key={i} className="gt-skeleton h-44 rounded-[var(--admin-radius)]" />)}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <p className="m-0 flex items-start gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
        <ShieldQuestion size={15} aria-hidden="true" className="mt-0.5 flex-none" />
        {t("reviews.admin.reported.intro")}
      </p>

      {open.length === 0 ? (
        <div className="gt-admin-panel">
          <EmptyState icon={ShieldCheck} title={t("reviews.admin.reported.emptyTitle")} body={t("reviews.admin.reported.emptyBody")} />
        </div>
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0">
          {open.map((r) => (
            <ReportedCard key={r.id} review={r} onOpen={onOpen} onAction={onAction} />
          ))}
        </ul>
      )}

      {resolved.length > 0 && (
        <section aria-labelledby="reported-resolved" className="grid gap-3">
          <h2 id="reported-resolved" className="text-[length:var(--text-body-md)]">{t("reviews.admin.reported.resolvedTitle")}</h2>
          <ul className="gt-admin-panel m-0 grid list-none p-0">
            {resolved.map((r) => {
              const last = r.reports[r.reports.length - 1];
              return (
                <li key={r.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                  <button type="button" onClick={() => onOpen(r.id)} className="gt-admin-row flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]">
                    <span className="min-w-0 truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">“{r.title}”</span>
                    <span className="flex items-center gap-2 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {t(`reviews.admin.reported.outcome.${last.resolution ?? "kept"}`)}
                      <ReviewStatusBadge status={r.status} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function ReportedCard({ review: r, onOpen, onAction }: { review: CustomerReview; onOpen: (id: string) => void; onAction: (kind: DialogAction, id: string) => void }) {
  const { t, i18n } = useTranslation();
  const when = useWhen();
  const customerOf = useReviewCustomer();
  const c = customerOf(r);
  const reports = openReports(r);
  const byReason = new Map<ReportReason, number>();
  for (const rep of reports) byReason.set(rep.reason, (byReason.get(rep.reason) ?? 0) + 1);
  const act = (kind: DialogAction) => () => onAction(kind, r.id);

  return (
    <li className="gt-admin-panel grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="grid content-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ReviewStatusBadge status={r.status} />
          <VerifiedBadge review={r} />
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {privacyName(c.firstName, c.lastName)} · {subjectName(r.subject, i18n.language)}
          </span>
        </div>
        <Stars rating={r.rating} size={13} />
        <strong className="text-[length:var(--text-body-sm)] text-[var(--text-primary)]">“{r.title}”</strong>
        <p lang={r.lang} className="m-0 line-clamp-4 text-[length:var(--text-caption)] leading-[var(--leading-normal)] text-[var(--text-body)]">{r.body}</p>
      </div>

      <div className="grid content-start gap-3 rounded-[var(--admin-radius-sm)] bg-[var(--gt-fuchsia-50)] p-3.5">
        <span className="flex items-center gap-2 text-[length:var(--text-caption)] font-semibold text-[var(--accent-highlight-ink)]">
          <Flag size={14} aria-hidden="true" />
          {t("reviews.admin.sheet.reports", { count: reports.length })}
        </span>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {[...byReason.entries()].map(([reason, n]) => (
            <li key={reason} className="rounded-[var(--radius-pill)] border border-[var(--gt-fuchsia-300)] bg-[var(--admin-panel)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--accent-highlight-ink)]">
              {t(`reviews.reportReasons.${reason}`)} {n > 1 && `× ${n}`}
            </li>
          ))}
        </ul>
        {reports.filter((rep) => rep.details).map((rep) => (
          <p key={rep.id} className="m-0 text-[11px] text-[var(--text-body)]">
            “{rep.details}” <span className="text-[var(--text-muted)]">— {when(rep.at)}</span>
          </p>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3 lg:col-span-2">
        <AdminButton variant="ghost" size="sm" iconLeft={Search} onClick={() => onOpen(r.id)}>{t("reviews.admin.actions.investigate")}</AdminButton>
        <span className="ml-auto flex flex-wrap gap-2">
          <AdminButton variant="ghost" size="sm" iconLeft={XCircle} onClick={act("remove")}>{t("reviews.admin.actions.remove")}</AdminButton>
          <AdminButton variant="outline" size="sm" iconLeft={EyeOff} onClick={act("hideReported")}>{t("reviews.admin.actions.hide")}</AdminButton>
          <AdminButton variant="dark" size="sm" iconLeft={ShieldCheck} onClick={act("keep")}>{t("reviews.admin.actions.keep")}</AdminButton>
        </span>
      </div>
    </li>
  );
}
