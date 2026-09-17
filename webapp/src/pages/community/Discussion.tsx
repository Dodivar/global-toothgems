import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";
import { ChevronRight, MessageCircle, Reply as ReplyIcon, ThumbsUp } from "lucide-react";
import clsx from "clsx";
import { getChannel, type Reply } from "../../data/community";
import { pick } from "../../data/types";
import { useCommunity } from "../../lib/community";
import { MemberAvatar } from "../../components/community/MemberAvatar";
import { MemberBadges } from "../../components/community/MemberBadges";
import { MemberButton } from "../../components/community/MemberProfile";
import { ReactionBar } from "../../components/community/ReactionBar";
import { ReplyComposer } from "../../components/community/ReplyComposer";
import { SaveButton } from "../../components/community/SaveButton";
import { TimeAgo } from "../../components/community/TimeAgo";
import { channelPath, COMMUNITY_ROOT, discussionPath } from "../../components/community/routes";
import { cardBase, focusRing } from "../../components/community/styles";

/**
 * One thread.
 *
 * Read like a conversation, not like a ticket queue: one column, the opening
 * post given the room a post deserves, then the answers in the order they were
 * written. Replies are flat on purpose — threaded replies turn eight artists
 * comparing adhesives into a tree nobody reads to the end.
 *
 * "Helpful answer" is the author's own mark, carried by the fixtures. It is a
 * label, never a score, and it never reorders the conversation.
 */
export function Discussion() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { discussionId = "" } = useParams();
  const { getDiscussion, memberOf, repliesOf, replyCountOf, discussionsIn } = useCommunity();

  const discussion = getDiscussion(discussionId);
  if (!discussion) return <Navigate to={COMMUNITY_ROOT} replace />;

  const channel = getChannel(discussion.channelId);
  const author = memberOf(discussion.authorId);
  const replies = repliesOf(discussion);
  const alsoHere = discussionsIn(discussion.channelId)
    .filter((d) => d.id !== discussion.id)
    .slice(0, 4);

  const focusComposer = () => {
    const field = document.getElementById(`reply-${discussion.id}`);
    if (field instanceof HTMLTextAreaElement) {
      field.scrollIntoView({ block: "center", behavior: "smooth" });
      field.focus();
    }
  };

  return (
    <div className="grid items-start gap-[clamp(20px,3vw,32px)] xl:grid-cols-[minmax(0,1fr)_296px]">
      <div className="grid min-w-0 gap-[clamp(18px,3vw,28px)]">
        <nav aria-label={t("community.breadcrumbLabel")}>
          <ol className="m-0 flex flex-wrap items-center gap-1.5 p-0 text-[length:var(--text-caption)] text-[var(--text-muted)]">
            <li className="flex items-center gap-1.5">
              <Link to={COMMUNITY_ROOT} className={clsx("font-semibold hover:text-[var(--text-primary)]", focusRing)}>
                {t("community.navHome")}
              </Link>
              <ChevronRight size={12} aria-hidden="true" className="text-[var(--text-subtle)]" />
            </li>
            {channel && (
              <li className="flex items-center gap-1.5">
                <Link
                  to={channelPath(channel.id)}
                  className={clsx("font-semibold hover:text-[var(--text-primary)]", focusRing)}
                >
                  {pick(channel.name, lang)}
                </Link>
                <ChevronRight size={12} aria-hidden="true" className="text-[var(--text-subtle)]" />
              </li>
            )}
            <li aria-current="page" className="truncate text-[var(--text-muted)]">
              {pick(discussion.title, lang)}
            </li>
          </ol>
        </nav>

        <article className={clsx("grid gap-5 p-[clamp(18px,3vw,28px)]", cardBase)}>
          <header className="grid gap-4">
            <h1 className="text-[length:var(--text-h2)] leading-[var(--leading-snug)]">
              {pick(discussion.title, lang)}
            </h1>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <MemberButton
                  member={author}
                  size="md"
                  sub={
                    <>
                      {pick(author.role, lang)} · <TimeAgo minutesAgo={discussion.minutesAgo} />
                    </>
                  }
                />
                <MemberBadges badges={author.badges} max={2} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-muted)]">
                <MessageCircle size={13} aria-hidden="true" />
                {t("community.replyCount", { count: replyCountOf(discussion) })}
              </span>
            </div>
          </header>

          <div className="grid gap-4">
            {discussion.body.map((paragraph, index) => (
              <p
                key={index}
                className="m-0 text-[length:var(--text-body-md)] leading-[var(--leading-relaxed)] text-[var(--text-body)]"
              >
                {pick(paragraph, lang)}
              </p>
            ))}
          </div>

          {discussion.image && (
            <img
              src={discussion.image}
              alt={discussion.imageAlt ? pick(discussion.imageAlt, lang) : ""}
              loading="lazy"
              decoding="async"
              /* Capped: the wall's photographs are portrait, and at full width
                 one of them would push every reply below the fold. */
              className="max-h-[520px] w-full rounded-[var(--radius-lg)] object-cover"
            />
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
            <ReactionBar targetId={discussion.id} counts={discussion.reactions} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={focusComposer}
                className={clsx(
                  "inline-flex h-8 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-primary)]",
                  focusRing,
                )}
              >
                <ReplyIcon size={14} aria-hidden="true" />
                {t("community.replyAction")}
              </button>
              <SaveButton discussionId={discussion.id} labelled />
            </div>
          </footer>
        </article>

        <section className="grid gap-4">
          <h2 className="gt-eyebrow">{t("community.repliesTitle", { count: replies.length })}</h2>

          {replies.length === 0 ? (
            <p className="m-0 rounded-[var(--radius-card)] border border-dashed border-[var(--border-default)] p-[var(--space-5)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("community.noRepliesYet")}
            </p>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {replies.map((reply) => (
                <li key={reply.id}>
                  <ReplyRow reply={reply} />
                </li>
              ))}
            </ul>
          )}

          <ReplyComposer discussionId={discussion.id} />
        </section>
      </div>

      <aside className="grid gap-4 xl:sticky xl:top-[92px]">
        <section className={clsx("grid gap-3.5 p-[var(--space-5)]", cardBase)}>
          <h2 className="gt-eyebrow">{t("community.aboutAuthor")}</h2>
          <div className="flex items-center gap-3">
            <MemberAvatar member={author} size="md" presence />
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-[length:var(--text-body-sm)] text-[var(--text-primary)]">
                {author.name}
              </strong>
              <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {author.location ?? pick(author.role, lang)}
              </span>
            </div>
          </div>
          <MemberBadges badges={author.badges} />
          <p className="m-0 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
            {pick(author.bio, lang)}
          </p>
          <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("community.contributionCount", { count: author.contributions })}
          </span>
        </section>

        {alsoHere.length > 0 && channel && (
          <section className={clsx("grid gap-3 p-[var(--space-5)]", cardBase)}>
            <h2 className="gt-eyebrow">{t("community.alsoInChannel", { channel: pick(channel.name, lang) })}</h2>
            <ul className="m-0 grid list-none gap-2 p-0">
              {alsoHere.map((other) => (
                <li key={other.id}>
                  <Link
                    to={discussionPath(other.id)}
                    className={clsx(
                      "grid gap-1 rounded-[var(--radius-md)] px-3 py-2 transition-colors hover:bg-[var(--gt-ink-100)]",
                      focusRing,
                    )}
                  >
                    <span className="text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
                      {pick(other.title, lang)}
                    </span>
                    <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      {t("community.replyCount", { count: replyCountOf(other) })} · <TimeAgo minutesAgo={other.minutesAgo} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}

function ReplyRow({ reply }: { reply: Reply }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { memberOf } = useCommunity();
  const author = memberOf(reply.authorId);

  return (
    <article
      className={clsx(
        "grid gap-3 p-[var(--space-5)]",
        cardBase,
        /* The author's own mark, carried by a left edge rather than by a tint
           alone — and the label below says it in words. */
        reply.helpful && "border-l-2 border-l-[var(--accent-cta)]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <MemberButton member={author} size="sm" sub={<TimeAgo minutesAgo={reply.minutesAgo} />} />
          <MemberBadges badges={author.badges} max={1} />
        </div>
        {reply.helpful && (
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--status-success-bg)] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--status-success-fg)]">
            <ThumbsUp size={12} aria-hidden="true" />
            {t("community.helpfulAnswer")}
          </span>
        )}
      </div>

      <p className="m-0 text-[length:var(--text-body-sm)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">
        {pick(reply.body, lang)}
      </p>

      <ReactionBar targetId={reply.id} counts={reply.reactions} size="sm" />
    </article>
  );
}
