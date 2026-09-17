import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MessageCircle, Pin } from "lucide-react";
import clsx from "clsx";
import type { Discussion } from "../../data/community";
import { pick } from "../../data/types";
import { useCommunity } from "../../lib/community";
import { MemberBadges } from "./MemberBadges";
import { MemberButton } from "./MemberProfile";
import { ReactionBar } from "./ReactionBar";
import { SaveButton } from "./SaveButton";
import { TimeAgo } from "./TimeAgo";
import { ChannelChip } from "./ChannelChip";
import { cardBase, cardHover, focusRing } from "./styles";
import { discussionPath } from "./routes";

/**
 * One discussion, as it appears in a list.
 *
 * The whole card opens the thread, but only the title is a link: the author
 * button, the reactions and the bookmark are controls of their own, and nesting
 * them inside an anchor would be invalid and unusable with a keyboard. The
 * title's `::after` covers the card instead, and the other controls sit above
 * it — one tab stop for the thread, one each for everything else.
 */
export function DiscussionCard({
  discussion,
  showChannel = false,
}: {
  discussion: Discussion;
  showChannel?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { memberOf, replyCountOf } = useCommunity();

  const author = memberOf(discussion.authorId);
  const replies = replyCountOf(discussion);
  const excerpt = pick(discussion.body[0], lang);

  return (
    <article className={clsx("group relative grid gap-3.5 p-[var(--space-5)]", cardBase, cardHover)}>
      <div className="relative z-[1] flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <MemberButton member={author} size="sm" sub={<TimeAgo minutesAgo={discussion.minutesAgo} />} />
          <MemberBadges badges={author.badges} max={1} />
        </div>
        <div className="flex items-center gap-2">
          {discussion.pinned && (
            <span className="inline-flex items-center gap-1 text-[length:var(--text-caption)] font-semibold text-[var(--text-muted)]">
              <Pin size={12} aria-hidden="true" />
              {t("community.pinned")}
            </span>
          )}
          {showChannel && <ChannelChip channelId={discussion.channelId} as="text" />}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-5">
        <div className="grid gap-2">
          <h3 className="text-[length:var(--text-h4)] leading-[var(--leading-snug)]">
            <Link
              to={discussionPath(discussion.id)}
              className={clsx(
                "rounded-[var(--radius-xs)] transition-colors duration-[var(--duration-fast)] after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--accent-highlight-ink)]",
                focusRing,
              )}
            >
              {pick(discussion.title, lang)}
            </Link>
          </h3>
          <p className="m-0 line-clamp-2 text-[length:var(--text-body-sm)] leading-[var(--leading-normal)] text-[var(--text-muted)]">
            {excerpt}
          </p>
        </div>

        {discussion.image && (
          <img
            src={discussion.image}
            alt=""
            loading="lazy"
            decoding="async"
            className="hidden h-[84px] w-[112px] flex-none rounded-[var(--radius-md)] object-cover sm:block"
          />
        )}
      </div>

      <div className="relative z-[1] flex flex-wrap items-center justify-between gap-3">
        <ReactionBar targetId={discussion.id} counts={discussion.reactions} size="sm" />
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-muted)]">
            <MessageCircle size={13} aria-hidden="true" />
            {t("community.replyCount", { count: replies })}
          </span>
          <SaveButton discussionId={discussion.id} />
        </div>
      </div>
    </article>
  );
}
