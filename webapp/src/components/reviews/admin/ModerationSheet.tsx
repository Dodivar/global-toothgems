import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  EyeOff,
  Flag,
  History,
  Languages,
  MessageSquareReply,
  MessageSquareWarning,
  NotebookPen,
  RotateCcw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import monogram from "../../../assets/monogram-blue.png";
import { AdminSheet, SheetBody, SheetFooter } from "../../admin/AdminSheet";
import { AdminButton } from "../../admin/AdminButton";
import { Fact } from "../../promotions/PromoUi";
import { Stars } from "../Stars";
import { EditedBadge, ReportedBadge, ReviewStatusBadge, UnverifiedBadge, VerifiedBadge } from "../ReviewBadges";
import { REJECT_REASONS, RESPONSE_MAX, openReports, privacyName, type CustomerReview, type HistoryEvent, type RejectReason } from "../../../data/reviewSystem";
import { getAdminOrder } from "../../../data/adminOrders";
import { isEditedPending } from "../../../lib/reviewRules";
import { subjectName, subjectPath, useReviewCustomer, useReviews } from "../../../lib/reviews";
import { useToast } from "../../../lib/toast";
import { formatDateShort } from "../../../lib/format";
import { useModerator, type DialogAction } from "./ModerationDialogs";

export function useWhen() {
  const { i18n } = useTranslation();
  return (iso: string) => {
    const time = new Intl.DateTimeFormat(i18n.language.startsWith("en") ? "en-IE" : "fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    return `${formatDateShort(iso)} · ${time}`;
  };
}

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]";

/**
 * The moderation panel: the whole review, who wrote it and why we believe
 * them, what happened to it so far, and the decision.
 *
 * The decision row is ordered by consequence. The expected next step is the
 * one primary button (approve a pending review, restore a hidden one, keep a
 * reported one that is fine); everything that takes a review away — reject,
 * hide, remove — is an outline or quiet button behind a confirmation, never
 * the loudest thing on screen.
 */
export function ModerationSheet({
  id,
  onClose,
  onAction,
}: {
  id: string | null;
  onClose: () => void;
  onAction: (kind: DialogAction, id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { getReview } = useReviews();
  const review = id ? getReview(id) : undefined;
  return (
    <AdminSheet
      open={Boolean(review)}
      onClose={onClose}
      width={640}
      closeLabel={t("reviews.form.close")}
      title={review ? t("reviews.admin.sheet.title", { id: review.id }) : ""}
      description={review ? subjectName(review.subject, i18n.language) : undefined}
      headerExtra={review && <HeaderBadges review={review} />}
    >
      {review && <SheetContent key={review.id} review={review} onAction={onAction} />}
    </AdminSheet>
  );
}

function HeaderBadges({ review }: { review: CustomerReview }) {
  const reports = openReports(review).length;
  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <ReviewStatusBadge status={review.status} size="md" />
      {review.orderRef ? <VerifiedBadge review={review} size="md" /> : <UnverifiedBadge size="md" />}
      {isEditedPending(review) && <EditedBadge size="md" />}
      {reports > 0 && <ReportedBadge count={reports} size="md" />}
    </div>
  );
}

function SheetContent({ review, onAction }: { review: CustomerReview; onAction: (kind: DialogAction, id: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const when = useWhen();
  const actor = useModerator();
  const { showToast } = useToast();
  const { reviews, approve, restore, respond, addNote, openPhotos } = useReviews();
  const customerOf = useReviewCustomer();
  const customer = customerOf(review);
  const author = privacyName(customer.firstName, customer.lastName);
  const reports = openReports(review);
  const order = review.orderRef ? getAdminOrder(review.orderRef) : undefined;
  const others = reviews.filter((r) => r.id !== review.id && customerOf(r).email === customer.email);

  const [draft, setDraft] = useState(review.response?.body ?? "");
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState("");

  const doApprove = () => {
    approve(review.id, actor);
    showToast(t("reviews.admin.toast.approved"), t("reviews.admin.toast.approvedBody", { name: author }));
  };
  const doRestore = () => {
    restore(review.id, actor);
    showToast(t("reviews.admin.toast.restored"), t("reviews.admin.toast.restoredBody"));
  };
  const publishResponse = () => {
    if (!draft.trim()) return;
    respond(review.id, actor, draft);
    setComposing(false);
    showToast(t("reviews.admin.toast.responded"), review.status === "published" ? t("reviews.admin.toast.respondedLive") : t("reviews.admin.toast.respondedLater"));
  };
  const saveNote = () => {
    if (!note.trim()) return;
    addNote(review.id, actor, note);
    setNote("");
    showToast(t("reviews.admin.toast.noted"));
  };

  return (
    <>
      <SheetBody>
        <div className="grid gap-6">
          {/* The review, as the customer wrote it. */}
          <section aria-labelledby="sheet-review" className="grid gap-3 rounded-[var(--admin-radius)] border border-[var(--border-subtle)] bg-[var(--admin-panel-sunken)] p-4">
            <h3 id="sheet-review" className="sr-only">{t("reviews.admin.sheet.review")}</h3>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Stars rating={review.rating} size={16} />
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("reviews.admin.sheet.ratingValue", { rating: review.rating })}</span>
            </div>
            <strong className="text-[length:var(--text-body-md)] text-[var(--text-primary)]">“{review.title}”</strong>
            <p lang={review.lang} className="m-0 whitespace-pre-line text-[length:var(--text-body-sm)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">
              {review.body}
            </p>
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-subtle)]">
              <Languages size={12} aria-hidden="true" />
              {t(`reviews.card.writtenIn.${review.lang}`)} · {t("reviews.admin.sheet.notTranslated")}
            </span>
            {review.tags.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={t("reviews.card.tagsLabel")}>
                {review.tags.map((tag) => (
                  <li key={tag} className="rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--gt-blue-700)]">
                    {t(`reviews.tags.${tag}`)}
                  </li>
                ))}
              </ul>
            )}
            {review.photos.length > 0 ? (
              <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0" aria-label={t("reviews.card.photosLabel", { count: review.photos.length })}>
                {review.photos.map((p, i) => (
                  <li key={p.src + i}>
                    <button
                      type="button"
                      onClick={() => openPhotos({ photos: review.photos, index: i, caption: t("reviews.photos.sharedBy", { name: author }) })}
                      aria-label={t("reviews.photos.open", { index: i + 1, total: review.photos.length, alt: p.alt || t("reviews.admin.sheet.noAlt") })}
                      className={clsx("block aspect-square w-full overflow-hidden rounded-[var(--admin-radius-sm)] bg-[var(--surface-sunken)]", focusRing)}
                    >
                      <img src={p.src} alt="" className="h-full w-full object-cover" />
                    </button>
                    {!p.alt && <span className="mt-1 block text-[10px] text-[var(--status-warning-fg)]">{t("reviews.admin.sheet.noAlt")}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("reviews.admin.sheet.noPhotos")}</span>
            )}
          </section>

          {/* Status context: what the customer was told. */}
          {review.status === "needsChanges" && review.changesRequest && (
            <Callout tone="info" title={t("reviews.admin.sheet.changesSent")}>
              <span lang={review.lang}>{review.changesRequest}</span>
            </Callout>
          )}
          {review.status === "rejected" && review.rejection && (
            <Callout tone="error" title={t("reviews.admin.sheet.rejectedAs", { reason: t(`reviews.rejectReasons.${review.rejection.reason}`) })}>
              {review.rejection.internal ?? t("reviews.admin.sheet.noInternal")}
            </Callout>
          )}
          {isEditedPending(review) && (
            <Callout tone="info" title={t("reviews.admin.sheet.editedTitle")}>{t("reviews.admin.sheet.editedBody")}</Callout>
          )}

          {reports.length > 0 && (
            <section aria-labelledby="sheet-reports" className="grid gap-3">
              <h3 id="sheet-reports" className="flex items-center gap-2 text-[length:var(--text-body-sm)]">
                <Flag size={15} aria-hidden="true" className="text-[var(--accent-highlight-ink)]" />
                {t("reviews.admin.sheet.reports", { count: reports.length })}
              </h3>
              <ul className="m-0 grid list-none gap-2 p-0">
                {reports.map((rep) => (
                  <li key={rep.id} className="grid gap-1 rounded-[var(--admin-radius-sm)] border border-[var(--gt-fuchsia-300)] bg-[var(--gt-fuchsia-50)] px-3 py-2">
                    <span className="flex flex-wrap items-center justify-between gap-2 text-[length:var(--text-caption)]">
                      <strong className="text-[var(--accent-highlight-ink)]">{t(`reviews.reportReasons.${rep.reason}`)}</strong>
                      <span className="text-[var(--text-muted)]">
                        {t(rep.source === "team" ? "reviews.admin.sheet.byTeam" : "reviews.admin.sheet.byCustomer")} · {when(rep.at)}
                      </span>
                    </span>
                    {rep.details && <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{rep.details}</span>}
                  </li>
                ))}
              </ul>
              <p className="m-0 text-[11px] text-[var(--text-muted)]">{t("reviews.admin.sheet.reportsNote")}</p>
            </section>
          )}

          <section aria-labelledby="sheet-facts" className="grid gap-3">
            <h3 id="sheet-facts" className="text-[length:var(--text-body-sm)]">{t("reviews.admin.sheet.details")}</h3>
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label={t("reviews.admin.sheet.customer")} value={`${customer.firstName} ${customer.lastName}`} />
              <Fact label={t("reviews.admin.sheet.publicName")} value={author} />
              <Fact label={t("reviews.admin.sheet.email")} value={<span className="break-all">{customer.email}</span>} />
              <Fact
                label={t(review.subject.kind === "course" ? "reviews.kind.course" : "reviews.kind.product")}
                value={
                  <Link to={subjectPath(review.subject)} className={clsx("inline-flex items-center gap-1 rounded-[2px] underline underline-offset-2", focusRing)}>
                    {subjectName(review.subject, lang)}
                    <ArrowUpRight size={12} aria-hidden="true" />
                  </Link>
                }
              />
              <Fact
                label={t("reviews.admin.sheet.order")}
                mono
                value={
                  review.orderRef ? (
                    order ? (
                      <Link to={`/admin/commandes/${review.orderRef}`} className={clsx("inline-flex items-center gap-1 rounded-[2px] underline underline-offset-2", focusRing)}>
                        {review.orderRef}
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </Link>
                    ) : (
                      review.orderRef
                    )
                  ) : (
                    "—"
                  )
                }
              />
              <Fact
                label={t("reviews.admin.sheet.verification")}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {review.orderRef ? <ShieldCheck size={14} aria-hidden="true" className="text-[var(--status-success-fg)]" /> : <XCircle size={14} aria-hidden="true" className="text-[var(--text-muted)]" />}
                    {review.orderRef
                      ? t(review.subject.kind === "course" ? "reviews.verified.student" : "reviews.verified.purchase")
                      : t("reviews.admin.sheet.noOrder")}
                  </span>
                }
              />
              <Fact label={t("reviews.admin.sheet.submitted")} value={when(review.submittedAt)} />
              {review.editedAt && <Fact label={t("reviews.admin.sheet.edited")} value={when(review.editedAt)} />}
              {review.publishedAt && <Fact label={t("reviews.admin.sheet.published")} value={when(review.publishedAt)} />}
              {review.progressPct != null && <Fact label={t("reviews.admin.sheet.progress")} value={`${review.progressPct} %`} />}
              <Fact label={t("reviews.admin.sheet.helpful")} value={String(review.helpful)} />
            </dl>
          </section>

          {/* Investigate: the customer's other reviews and the order book. */}
          <section aria-labelledby="sheet-investigate" className="grid gap-2 rounded-[var(--admin-radius)] border border-dashed border-[var(--border-default)] p-3.5">
            <h3 id="sheet-investigate" className="flex items-center gap-2 text-[length:var(--text-body-sm)]">
              <Search size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
              {t("reviews.admin.sheet.investigate")}
            </h3>
            <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-body)]">
              {t("reviews.admin.sheet.otherReviews", { count: others.length })}
              {others.length > 0 && ` — ${others.map((o) => `${subjectName(o.subject, lang)} (${t(`reviews.status.${o.status}`)})`).join(", ")}`}
            </p>
            <div className="flex flex-wrap gap-3 text-[length:var(--text-caption)] font-semibold">
              <Link to={`/admin/commandes?q=${encodeURIComponent(customer.lastName || customer.email)}`} className={clsx("inline-flex items-center gap-1 rounded-[2px] underline underline-offset-2", focusRing)}>
                {t("reviews.admin.sheet.searchOrders")}
                <ArrowUpRight size={12} aria-hidden="true" />
              </Link>
              {review.orderRef && !order && <span className="font-normal text-[var(--text-muted)]">{t("reviews.admin.sheet.orderOutside")}</span>}
            </div>
          </section>

          {/* Public response. Previewed exactly as the storefront shows it. */}
          <section aria-labelledby="sheet-response" className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="sheet-response" className="flex items-center gap-2 text-[length:var(--text-body-sm)]">
                <MessageSquareReply size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
                {t("reviews.admin.sheet.response")}
              </h3>
              {review.response && !composing && (
                <div className="flex gap-1">
                  <AdminButton size="sm" variant="ghost" onClick={() => { setDraft(review.response!.body); setComposing(true); }}>
                    {t("reviews.admin.sheet.editResponse")}
                  </AdminButton>
                  <AdminButton size="sm" variant="ghost" onClick={() => onAction("removeResponse", review.id)}>
                    {t("reviews.admin.sheet.removeResponse")}
                  </AdminButton>
                </div>
              )}
            </div>
            {review.response && !composing ? (
              <ResponsePreview body={review.response.body} meta={`${review.response.by} · ${when(review.response.at)}`} />
            ) : composing ? (
              <div className="grid gap-2">
                <label className="grid gap-1.5">
                  <span className="sr-only">{t("reviews.admin.sheet.response")}</span>
                  <textarea
                    rows={4}
                    maxLength={RESPONSE_MAX}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={t("reviews.admin.sheet.responsePlaceholder", { name: customer.firstName })}
                    className="gt-admin-field min-h-[108px]"
                    data-autofocus
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] tabular-nums text-[var(--text-subtle)]">{draft.length} / {RESPONSE_MAX}</span>
                  <div className="flex gap-2">
                    <AdminButton size="sm" variant="ghost" onClick={() => setComposing(false)}>{t("reviews.admin.cancel")}</AdminButton>
                    <AdminButton size="sm" variant="dark" disabled={!draft.trim()} onClick={publishResponse}>
                      {t(review.response ? "reviews.admin.sheet.updateResponse" : "reviews.admin.sheet.publishResponse")}
                    </AdminButton>
                  </div>
                </div>
                {draft.trim() && (
                  <div className="grid gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-subtle)]">{t("reviews.admin.sheet.preview")}</span>
                    <ResponsePreview body={draft} />
                  </div>
                )}
                <p className="m-0 text-[11px] text-[var(--text-muted)]">{t("reviews.admin.sheet.responseNote")}</p>
              </div>
            ) : (
              <AdminButton variant="outline" size="sm" iconLeft={MessageSquareReply} onClick={() => setComposing(true)} className="justify-self-start">
                {t("reviews.admin.sheet.writeResponse")}
              </AdminButton>
            )}
          </section>

          <section aria-labelledby="sheet-notes" className="grid gap-3">
            <h3 id="sheet-notes" className="flex items-center gap-2 text-[length:var(--text-body-sm)]">
              <NotebookPen size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
              {t("reviews.admin.sheet.notes")}
              <span className="text-[11px] font-normal text-[var(--text-subtle)]">· {t("reviews.admin.sheet.notesPrivate")}</span>
            </h3>
            {review.notes.length > 0 && (
              <ul className="m-0 grid list-none gap-2 p-0">
                {review.notes.map((n) => (
                  <li key={n.id} className="grid gap-1 rounded-[var(--admin-radius-sm)] bg-[var(--status-warning-bg)] px-3 py-2">
                    <span className="text-[length:var(--text-caption)] text-[var(--text-body)]">{n.body}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{n.by} · {when(n.at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="sr-only">{t("reviews.admin.sheet.addNote")}</span>
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("reviews.admin.sheet.notePlaceholder")} className="gt-admin-field min-h-[64px]" />
              </label>
              <AdminButton size="sm" variant="outline" disabled={!note.trim()} onClick={saveNote} className="justify-self-start">
                {t("reviews.admin.sheet.addNote")}
              </AdminButton>
            </div>
          </section>

          <section aria-labelledby="sheet-history" className="grid gap-3">
            <h3 id="sheet-history" className="flex items-center gap-2 text-[length:var(--text-body-sm)]">
              <History size={15} aria-hidden="true" className="text-[var(--text-muted)]" />
              {t("reviews.admin.sheet.history")}
            </h3>
            <ol className="m-0 grid list-none gap-0 border-l border-[var(--border-subtle)] p-0 pl-4">
              {[...review.history].reverse().map((h, i) => (
                <li key={`${h.kind}-${h.at}-${i}`} className="relative grid gap-0.5 pb-3 last:pb-0">
                  <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[var(--gt-ink-400)] ring-4 ring-[var(--admin-panel)]" />
                  <span className="text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
                    {t(`reviews.admin.history.${h.kind}`)}
                    {reasonOf(h) && ` · ${t(reasonOf(h)!)}`}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {h.by === "customer" ? t("reviews.admin.sheet.aCustomer") : h.by} · {when(h.at)}
                  </span>
                  {h.note && !reasonOf(h) && <span className="text-[11px] text-[var(--text-body)]">{h.note}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </SheetBody>

      <SheetFooter>
        <DecisionRow review={review} reports={reports.length} onAction={onAction} approve={doApprove} restore={doRestore} />
      </SheetFooter>
    </>
  );
}

function DecisionRow({
  review,
  reports,
  onAction,
  approve,
  restore,
}: {
  review: CustomerReview;
  reports: number;
  onAction: (kind: DialogAction, id: string) => void;
  approve: () => void;
  restore: () => void;
}) {
  const { t } = useTranslation();
  const act = (kind: DialogAction) => () => onAction(kind, review.id);
  const primary = (children: ReactNode) => <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>;

  if (reports > 0 && review.status === "published") {
    return (
      <>
        <AdminButton variant="ghost" size="sm" iconLeft={XCircle} onClick={act("remove")}>{t("reviews.admin.actions.remove")}</AdminButton>
        <AdminButton variant="outline" size="sm" iconLeft={EyeOff} onClick={act("hideReported")}>{t("reviews.admin.actions.hide")}</AdminButton>
        {primary(<AdminButton variant="primary" iconLeft={ShieldCheck} onClick={act("keep")}>{t("reviews.admin.actions.keep")}</AdminButton>)}
      </>
    );
  }

  switch (review.status) {
    case "pending":
    case "needsChanges":
      return (
        <>
          <AdminButton variant="ghost" size="sm" iconLeft={XCircle} onClick={act("reject")}>{t("reviews.admin.actions.reject")}</AdminButton>
          {review.status === "pending" && (
            <AdminButton variant="outline" size="sm" iconLeft={MessageSquareWarning} onClick={act("changes")}>{t("reviews.admin.actions.changes")}</AdminButton>
          )}
          {primary(
            <AdminButton variant="primary" iconLeft={CheckCircle2} onClick={approve}>
              {t(review.status === "pending" ? "reviews.admin.actions.approve" : "reviews.admin.actions.approveAsIs")}
            </AdminButton>,
          )}
        </>
      );
    case "published":
      return (
        <>
          <AdminButton variant="ghost" size="sm" iconLeft={Flag} onClick={act("flag")}>{t("reviews.admin.actions.flag")}</AdminButton>
          <AdminButton variant="outline" size="sm" iconLeft={EyeOff} onClick={act("hide")}>{t("reviews.admin.actions.hide")}</AdminButton>
          {primary(<span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("reviews.admin.actions.liveHint")}</span>)}
        </>
      );
    case "hidden":
      return (
        <>
          <AdminButton variant="ghost" size="sm" iconLeft={XCircle} onClick={act("reject")}>{t("reviews.admin.actions.reject")}</AdminButton>
          {primary(<AdminButton variant="primary" iconLeft={RotateCcw} onClick={restore}>{t("reviews.admin.actions.restore")}</AdminButton>)}
        </>
      );
    case "rejected":
      return primary(
        <AdminButton variant="outline" iconLeft={CheckCircle2} onClick={approve}>{t("reviews.admin.actions.approveAnyway")}</AdminButton>,
      );
  }
}

/** A history note that is a reason code, as its translation key; free text otherwise. */
function reasonOf(h: HistoryEvent): string | null {
  if (!h.note) return null;
  if (h.kind === "reported" || h.kind === "flagged") return `reviews.reportReasons.${h.note}`;
  if (h.kind === "rejected" && REJECT_REASONS.includes(h.note as RejectReason)) return `reviews.rejectReasons.${h.note}`;
  return null;
}

function ResponsePreview({ body, meta }: { body: string; meta?: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1.5 rounded-[var(--admin-radius-sm)] border-l-2 border-[var(--gt-blue-300)] bg-[var(--surface-brand-wash)] px-3.5 py-2.5">
      <span className="flex flex-wrap items-center gap-2 text-[length:var(--text-caption)] font-semibold text-[var(--text-primary)]">
        <img src={monogram} alt="" aria-hidden="true" className="h-4 w-auto" />
        {t("reviews.response.from")}
        {meta && <span className="font-normal text-[var(--text-muted)]">· {meta}</span>}
      </span>
      <p className="m-0 whitespace-pre-line text-[length:var(--text-caption)] text-[var(--text-body)]">{body}</p>
    </div>
  );
}

function Callout({ tone, title, children }: { tone: "info" | "error"; title: string; children: ReactNode }) {
  return (
    <div
      className={clsx(
        "grid gap-1 rounded-[var(--admin-radius-sm)] border px-3.5 py-2.5 text-[length:var(--text-caption)]",
        tone === "info" ? "border-[var(--gt-blue-200)] bg-[var(--status-info-bg)]" : "border-[var(--gt-red-400)] bg-[var(--status-error-bg)]",
      )}
    >
      <strong className={tone === "info" ? "text-[var(--status-info-fg)]" : "text-[var(--status-error-fg)]"}>{title}</strong>
      <span className="text-[var(--text-body)]">{children}</span>
    </div>
  );
}
