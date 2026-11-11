"use client";

import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Flag } from "lucide-react";
import clsx from "clsx";
import { Link } from "../../lib/navigation";
import { useChat } from "../../lib/communityChat/chatStore";
import { plainText } from "../../lib/communityChat/chatLogic";
import {
  ILLEGAL_CATEGORIES,
  REPORT_REASONS,
  TEXT_MAX,
  TEXT_MIN,
  reportDraftErrors,
  type ReportDraft,
  type ReportDraftError,
} from "../../lib/communityChat/moderation";
import { ChatDialog, focusRing, useChatTime } from "./primitives";

const field =
  "w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-white px-3 py-2 text-[14px] text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--gt-blue-300)]";
const label = "text-[13px] font-bold text-[var(--text-primary)]";
const errorText = "m-0 text-[12.5px] font-semibold text-[var(--status-error-fg)]";

/**
 * Reporting a message or one of its images (decision 132, DSA art. 16): a
 * reason from the list, the category for unlawful content, an explanation.
 * The database takes one report per member and message and answers with the
 * date it was received, shown as the acknowledgement; the outcome is e-mailed.
 */
export function ReportDialog({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { messages, memberOf, nameOf, report } = useChat();
  const { clock, day } = useChatTime();
  const titleId = useId();
  const reasonName = useId();
  const [draft, setDraft] = useState<ReportDraft>({ reason: "", category: "", details: "" });
  const [attachmentId, setAttachmentId] = useState("");
  const [shown, setShown] = useState<ReportDraftError[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [receivedAt, setReceivedAt] = useState<string | null>(null);
  const message = messages.find((m) => m.id === messageId);
  const author = message ? memberOf(message.authorId) : undefined;
  const images = (message?.attachments ?? []).filter((a) => a.id);

  const submit = async () => {
    if (!message) return;
    const errors = reportDraftErrors(draft);
    setShown(errors);
    if (errors.length) return;
    setBusy(true);
    setFailure(null);
    const result = await report(message, draft, attachmentId || undefined);
    setBusy(false);
    if (result.ok) setReceivedAt(result.createdAt);
    else setFailure(t(`lounge.report.errors.${result.reason}`));
  };

  return (
    <ChatDialog titleId={titleId} onClose={onClose} width="520px">
      {receivedAt ? (
        <div className="grid gap-4 p-6" role="status">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--gt-emerald-50)] text-[var(--gt-emerald-600)]">
            <CheckCircle2 size={22} aria-hidden="true" />
          </span>
          <h2 id={titleId} className="m-0 text-[19px] font-[var(--weight-black)] text-[var(--text-primary)]">
            {t("lounge.report.receivedTitle")}
          </h2>
          <p className="m-0 text-[14px] leading-relaxed text-[var(--text-body)]">
            {t("lounge.report.receivedBody", { date: `${day(Date.parse(receivedAt), Date.now())} · ${clock(Date.parse(receivedAt))}` })}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className={clsx("inline-flex h-10 items-center rounded-[var(--radius-pill)] bg-[var(--surface-inverse)] px-5 text-[14px] font-bold text-white", focusRing)}
            >
              {t("common.close")}
            </button>
            <Link to="/compte/moderation" onClick={onClose} className={clsx("text-[13.5px] font-semibold text-[var(--text-primary)] underline underline-offset-2", focusRing)}>
              {t("lounge.report.followUp")}
            </Link>
          </div>
        </div>
      ) : (
        <form
          noValidate
          className="grid gap-4 overflow-y-auto p-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-1 pr-8">
            <h2 id={titleId} className="m-0 flex items-center gap-2 text-[19px] font-[var(--weight-black)] text-[var(--text-primary)]">
              <Flag size={18} aria-hidden="true" />
              {t("lounge.report.title")}
            </h2>
            <p className="m-0 text-[13.5px] leading-relaxed text-[var(--text-muted)]">{t("lounge.report.intro")}</p>
          </div>

          {message && (
            <blockquote className="m-0 rounded-[var(--radius-md)] border-l-2 border-[var(--border-default)] bg-[var(--surface-sunken)] px-3 py-2 text-[13.5px] text-[var(--text-body)]">
              <span className="block text-[12px] font-bold text-[var(--text-primary)]">{author?.name ?? "—"}</span>
              <span className="line-clamp-3 whitespace-pre-line">{plainText(message.parts, nameOf) || t("lounge.report.imageOnly")}</span>
            </blockquote>
          )}

          <fieldset className="m-0 grid gap-2 border-0 p-0" aria-describedby={shown.includes("reason") ? `${reasonName}-error` : undefined}>
            <legend className={clsx(label, "mb-1 p-0")}>{t("lounge.report.reasonLabel")}</legend>
            {REPORT_REASONS.map((reason) => (
              <label key={reason} className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[14px] hover:bg-[var(--gt-blue-50)]">
                <input
                  type="radio"
                  name={reasonName}
                  value={reason}
                  checked={draft.reason === reason}
                  onChange={() => setDraft((d) => ({ ...d, reason, category: reason === "illegal" ? d.category : "" }))}
                  className="mt-1"
                  data-autofocus={reason === REPORT_REASONS[0] ? true : undefined}
                />
                <span className="grid gap-0.5">
                  <span className="font-semibold text-[var(--text-primary)]">{t(`lounge.moderation.reasons.${reason}`)}</span>
                  <span className="text-[12.5px] text-[var(--text-muted)]">{t(`lounge.report.reasonHints.${reason}`)}</span>
                </span>
              </label>
            ))}
            {shown.includes("reason") && <p id={`${reasonName}-error`} className={errorText}>{t("lounge.report.errors.reason")}</p>}
          </fieldset>

          {draft.reason === "illegal" && (
            <div className="grid gap-1.5">
              <label htmlFor={`${titleId}-category`} className={label}>{t("lounge.report.categoryLabel")}</label>
              <select
                id={`${titleId}-category`}
                value={draft.category}
                onChange={(event) => setDraft((d) => ({ ...d, category: event.target.value as ReportDraft["category"] }))}
                aria-invalid={shown.includes("category") || undefined}
                className={field}
              >
                <option value="">{t("lounge.report.categoryPlaceholder")}</option>
                {ILLEGAL_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{t(`lounge.moderation.categories.${category}`)}</option>
                ))}
              </select>
              {shown.includes("category") && <p className={errorText}>{t("lounge.report.errors.category")}</p>}
            </div>
          )}

          {images.length > 0 && (
            <div className="grid gap-1.5">
              <label htmlFor={`${titleId}-image`} className={label}>{t("lounge.report.imageLabel")}</label>
              <select id={`${titleId}-image`} value={attachmentId} onChange={(event) => setAttachmentId(event.target.value)} className={field}>
                <option value="">{t("lounge.report.wholeMessage")}</option>
                {images.map((image, index) => (
                  <option key={image.id} value={image.id}>{t("lounge.report.imageN", { n: index + 1, alt: image.alt || "" })}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-1.5">
            <label htmlFor={`${titleId}-details`} className={label}>{t("lounge.report.detailsLabel")}</label>
            <textarea
              id={`${titleId}-details`}
              rows={4}
              maxLength={TEXT_MAX}
              value={draft.details}
              onChange={(event) => setDraft((d) => ({ ...d, details: event.target.value }))}
              placeholder={t("lounge.report.detailsPlaceholder")}
              aria-invalid={shown.includes("details") || undefined}
              className={clsx(field, "resize-y")}
            />
            <p className="m-0 text-[12px] text-[var(--text-muted)]">{t("lounge.report.detailsHint", { min: TEXT_MIN, max: TEXT_MAX })}</p>
            {shown.includes("details") && <p className={errorText}>{t("lounge.report.errors.details", { min: TEXT_MIN })}</p>}
          </div>

          <p className="m-0 text-[12px] leading-relaxed text-[var(--text-muted)]">{t("lounge.report.privacy")}</p>

          <div aria-live="polite" className="empty:hidden">
            {failure && <p className={errorText}>{failure}</p>}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={clsx("inline-flex h-10 items-center rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-white px-4 text-[14px] font-bold text-[var(--text-primary)]", focusRing)}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={busy || !message}
              className={clsx("inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--surface-inverse)] px-5 text-[14px] font-bold text-white disabled:opacity-60", focusRing)}
            >
              <Flag size={15} aria-hidden="true" />
              {busy ? t("lounge.report.sending") : t("lounge.report.submit")}
            </button>
          </div>
        </form>
      )}
    </ChatDialog>
  );
}
