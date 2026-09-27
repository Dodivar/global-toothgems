import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import clsx from "clsx";
import { CheckCircle2, MessageSquareHeart, Send, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../../ui/Dialog";
import { Button } from "../../ui/Button";
import { studioStore } from "../../../lib/studio3d/store";
import { FEEDBACK_CATEGORIES, type FeedbackCategory } from "../../../lib/studioWorkspace/types";
import { FEEDBACK_MESSAGE_MAX, validateFeedback, type FeedbackError } from "../../../lib/studioWorkspace/validation";
import { useWorkspace } from "../../../lib/studioWorkspace/workspace";
import { SignInPrompt } from "./SignInPrompt";
import { chipClass, fieldClass, focusRing } from "./workspaceStyles";

/**
 * "Give feedback": a rating, a kind and a few words about the Studio. Sent
 * through the workspace's feedback repository (the `studio_feedback` table
 * once connected) with a little context to reproduce what was reported —
 * the page, the piece count, the language and the window size, nothing else.
 */
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { userId, submitFeedback } = useWorkspace();
  const ids = { rating: useId(), type: useId(), message: useId(), error: useId() };
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<FeedbackError | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const stars = useRef<(HTMLButtonElement | null)[]>([]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateFeedback({ rating, category, message });
    setError(problem);
    if (problem || busy) return;
    setBusy(true);
    const ok = await submitFeedback({
      rating,
      category,
      message,
      context: {
        path: window.location.pathname,
        pieces: studioStore.jewels.length,
        language: i18n.language.slice(0, 2),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      },
    });
    setBusy(false);
    if (ok) setSent(true);
  };

  // Arrow keys move through the stars like a radio group.
  const onStarKey = (e: KeyboardEvent, value: number) => {
    const next = e.key === "ArrowRight" || e.key === "ArrowUp" ? value + 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? value - 1 : 0;
    if (!next) return;
    e.preventDefault();
    const clamped = Math.min(5, Math.max(1, next));
    setRating(clamped);
    stars.current[clamped - 1]?.focus();
  };

  if (sent) {
    return (
      <Dialog open onClose={onClose} title={t("studio.workspace.feedback.thanksTitle")} closeLabel={t("studio.workspace.close")}>
        <div className="grid justify-items-center gap-3 py-4 text-center">
          <span className="gt-ws-pop grid h-14 w-14 place-items-center rounded-full bg-[var(--status-success-bg)] text-[var(--accent-cta-ink)]">
            <CheckCircle2 size={28} aria-hidden="true" />
          </span>
          <p className="m-0 max-w-[36ch] text-[length:var(--text-body-sm)] leading-relaxed text-[var(--text-body)]">
            {t("studio.workspace.feedback.thanksBody")}
          </p>
          <Button variant="dark" size="sm" onClick={onClose} className="mt-2">
            {t("studio.workspace.feedback.backToStudio")}
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={t("studio.workspace.feedback.title")}
      description={t("studio.workspace.feedback.sub")}
      icon={<MessageSquareHeart size={17} />}
      closeLabel={t("studio.workspace.close")}
    >
      {!userId ? (
        <SignInPrompt
          compact
          onNavigate={onClose}
          title={t("studio.workspace.feedback.signInTitle")}
          body={t("studio.workspace.feedback.signInBody")}
        />
      ) : (
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend id={ids.rating} className="mb-2 p-0 text-[12.5px] font-bold text-[var(--text-primary)]">
              {t("studio.workspace.feedback.rating")}
            </legend>
            <div role="radiogroup" aria-labelledby={ids.rating} className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  ref={(node) => {
                    stars.current[v - 1] = node;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={rating === v}
                  aria-label={t("studio.workspace.feedback.stars", { count: v })}
                  tabIndex={rating === v || (!rating && v === 1) ? 0 : -1}
                  onClick={() => setRating(v)}
                  onKeyDown={(e) => onStarKey(e, rating || 1)}
                  className={clsx("grid h-10 w-10 place-items-center rounded-full transition-transform duration-[var(--duration-fast)] hover:scale-110", focusRing)}
                >
                  <Star
                    size={26}
                    aria-hidden="true"
                    strokeWidth={1.6}
                    className={clsx(
                      "transition-colors",
                      v <= rating ? "fill-[var(--gt-emerald-400)] text-[var(--gt-emerald-500)]" : "text-[var(--gt-ink-300)]",
                      v === rating && "gt-ws-pop",
                    )}
                  />
                </button>
              ))}
              <span className="ml-2 text-[12.5px] font-semibold text-[var(--text-muted)]" aria-hidden="true">
                {rating ? t(`studio.workspace.feedback.ratingLabels.${rating}`) : ""}
              </span>
            </div>
            {error === "ratingMissing" && (
              <p className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">{t("studio.workspace.feedback.errors.ratingMissing")}</p>
            )}
          </fieldset>

          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend id={ids.type} className="mb-2 p-0 text-[12.5px] font-bold text-[var(--text-primary)]">
              {t("studio.workspace.feedback.type")}
            </legend>
            <div role="radiogroup" aria-labelledby={ids.type} className="flex flex-wrap gap-1.5">
              {FEEDBACK_CATEGORIES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={category === c} onClick={() => setCategory(c)} className={chipClass(category === c)}>
                  {t(`studio.workspace.feedback.types.${c}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={ids.message} className="text-[12.5px] font-bold text-[var(--text-primary)]">
                {t("studio.workspace.feedback.message")}
              </label>
              <span aria-hidden="true" className="text-[11px] tabular-nums text-[var(--text-subtle)]">
                {message.length}/{FEEDBACK_MESSAGE_MAX}
              </span>
            </div>
            <textarea
              id={ids.message}
              rows={5}
              value={message}
              maxLength={FEEDBACK_MESSAGE_MAX}
              aria-invalid={error === "messageTooShort" || error === "messageTooLong"}
              aria-describedby={error === "messageTooShort" ? ids.error : undefined}
              placeholder={t("studio.workspace.feedback.placeholder")}
              onChange={(e) => setMessage(e.target.value)}
              className={`${fieldClass} resize-y leading-relaxed`}
            />
            {error === "messageTooShort" && (
              <p id={ids.error} className="m-0 text-[12px] font-semibold text-[var(--status-error-fg)]">
                {t("studio.workspace.feedback.errors.messageTooShort")}
              </p>
            )}
            <p className="m-0 text-[11.5px] text-[var(--text-subtle)]">{t("studio.workspace.feedback.privacy")}</p>
          </div>

          <div className="flex flex-wrap justify-end gap-2.5 border-t border-[var(--border-subtle)] pt-4">
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t("studio.workspace.cancel")}
            </Button>
            <Button type="submit" variant="primary" size="sm" iconLeft={Send} loading={busy}>
              {t("studio.workspace.feedback.send")}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
