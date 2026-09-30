import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router-dom";
import { Bookmark, MessageCircle, PenLine } from "lucide-react";
import clsx from "clsx";
import { pick } from "../../data/types";
import { useCommunity } from "../../lib/community";
import { DiscussionCard } from "../../components/community/DiscussionCard";
import { EmptyState } from "../../components/community/EmptyState";
import { StartDiscussionButton } from "../../components/community/NewDiscussion";
import { TimeAgo } from "../../components/community/TimeAgo";
import { ChannelChip } from "../../components/community/ChannelChip";
import { ACTIVITY_VIEWS, COMMUNITY_ROOT, discussionPath, type ActivityView } from "../../components/community/routes";
import { cardBase, cardHover, focusRing } from "../../components/community/styles";

/**
 * Your activity: what you wrote, what you answered, what you kept.
 *
 * One route per view rather than tabs, so each list is a place that can be
 * linked to and returned to. All three start empty in a fresh session, which is
 * exactly when an empty state has to do its job — each one names the action
 * that fills it rather than reporting that there is nothing.
 */
export function Activity() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { view = "" } = useParams();
  const { myDiscussions, myReplies, savedDiscussions, replyCountOf } = useCommunity();

  if (!ACTIVITY_VIEWS.includes(view as ActivityView)) {
    return <Navigate to={COMMUNITY_ROOT} replace />;
  }

  const mine = myDiscussions();
  const replies = myReplies();
  const saved = savedDiscussions();

  const heading = {
    discussions: { title: t("community.navMyDiscussions"), body: t("community.activityDiscussionsBody") },
    reponses: { title: t("community.navMyReplies"), body: t("community.activityRepliesBody") },
    enregistrees: { title: t("community.navSaved"), body: t("community.activitySavedBody") },
  }[view as ActivityView];

  return (
    <>
      <header className="grid gap-2">
        <span className="gt-eyebrow">{t("community.navGroupActivity")}</span>
        <h1 className="text-[length:var(--text-h2)]">{heading.title}</h1>
        <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {heading.body}
        </p>
      </header>

      {view === "discussions" &&
        (mine.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title={t("community.emptyMineTitle")}
            body={t("community.emptyMineBody")}
            action={<StartDiscussionButton />}
          />
        ) : (
          <div className="grid gap-4">
            {mine.map((discussion) => (
              <DiscussionCard key={discussion.id} discussion={discussion} showChannel />
            ))}
          </div>
        ))}

      {view === "reponses" &&
        (replies.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            tone="emerald"
            title={t("community.emptyRepliesTitle")}
            body={t("community.emptyRepliesBody")}
            action={
              <Link
                to={COMMUNITY_ROOT}
                className={clsx(
                  "inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-5 py-2.5 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]",
                  focusRing,
                )}
              >
                {t("community.emptyRepliesCta")}
              </Link>
            }
          />
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0">
            {replies.map(({ reply, discussion }) => (
              <li key={reply.id}>
                <Link
                  to={discussionPath(discussion.id)}
                  className={clsx("grid gap-2.5 p-[var(--space-5)]", cardBase, cardHover, focusRing)}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <ChannelChip channelId={discussion.channelId} as="text" />
                    <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                      <TimeAgo minutesAgo={reply.minutesAgo} />
                    </span>
                  </span>
                  <strong className="text-[length:var(--text-body-md)] text-[var(--text-primary)]">
                    {pick(discussion.title, lang)}
                  </strong>
                  <p className="m-0 line-clamp-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                    {pick(reply.body, lang)}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    <MessageCircle size={12} aria-hidden="true" />
                    {t("community.replyCount", { count: replyCountOf(discussion) })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}

      {view === "enregistrees" &&
        (saved.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            tone="fuchsia"
            title={t("community.emptySavedTitle")}
            body={t("community.emptySavedBody")}
            action={
              <Link
                to={COMMUNITY_ROOT}
                className={clsx(
                  "inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-5 py-2.5 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]",
                  focusRing,
                )}
              >
                {t("community.emptySavedCta")}
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4">
            {saved.map((discussion) => (
              <DiscussionCard key={discussion.id} discussion={discussion} showChannel />
            ))}
          </div>
        ))}
    </>
  );
}
