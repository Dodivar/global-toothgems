import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { Button } from "../ui/Button";
import { useCommunity } from "../../lib/community";
import { useToast } from "../../lib/toast";
import { MemberAvatar } from "./MemberAvatar";

/**
 * The reply box at the foot of a thread.
 *
 * Deliberately one field: a subject line, a formatting bar and a preview tab
 * would turn a conversation between artists into a support ticket. The avatar
 * beside it is the visitor's own, so it is obvious who is about to speak.
 */
export function ReplyComposer({ discussionId }: { discussionId: string }) {
  const { t } = useTranslation();
  const { viewer, addReply } = useCommunity();
  const { showToast } = useToast();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const ready = body.trim().length > 1;

  const submit = () => {
    if (!ready || sending) return;
    setSending(true);
    /* Same beat as the composer: the send state has to be visible once, or the
       reply appears to have been there all along. */
    window.setTimeout(() => {
      addReply(discussionId, body.trim());
      setBody("");
      setSending(false);
      showToast(t("community.toastReplied"));
    }, 320);
  };

  return (
    <form
      className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-[var(--space-5)] shadow-[var(--shadow-xs)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start gap-3">
        <MemberAvatar member={viewer} size="sm" />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <label htmlFor={`reply-${discussionId}`} className="sr-only">
            {t("community.replyLabel")}
          </label>
          <textarea
            id={`reply-${discussionId}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("community.replyPlaceholder")}
            rows={3}
            className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-card)] p-3.5 text-sm leading-[var(--leading-normal)] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pl-0 sm:pl-12">
        <p className="m-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("community.replyHint")}</p>
        <Button type="submit" variant="primary" size="sm" iconRight={Send} disabled={!ready} loading={sending}>
          {t("community.replySend")}
        </Button>
      </div>
    </form>
  );
}
