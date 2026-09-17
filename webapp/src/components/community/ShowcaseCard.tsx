import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import clsx from "clsx";
import type { Discussion } from "../../data/community";
import { pick } from "../../data/types";
import { useCommunity } from "../../lib/community";
import { MemberButton } from "./MemberProfile";
import { ReactionBar } from "./ReactionBar";
import { SaveButton } from "./SaveButton";
import { TimeAgo } from "./TimeAgo";
import { cardBase, cardHover, focusRing } from "./styles";
import { discussionPath } from "./routes";

/**
 * One creation on the Show your work wall.
 *
 * Image-led, and deliberately not a forum row: this channel is where the
 * community looks at work rather than reads about it. The card is still the
 * same discussion underneath, so a creation opens a thread like everything
 * else.
 *
 * Three crops cycle through the column so the wall composes like a wall
 * instead of a grid. They are fixed ratios rather than the photographs' own,
 * because an intrinsic height that only arrives with the image is a layout
 * shift in a lazily loaded gallery. The column break and the gutter belong to
 * whoever lays the wall out, not to the card.
 */
const CROPS = ["aspect-[4/5]", "aspect-square", "aspect-[5/6]"];

export function ShowcaseCard({ discussion, index }: { discussion: Discussion; index: number }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { memberOf, replyCountOf } = useCommunity();

  const author = memberOf(discussion.authorId);
  const replies = replyCountOf(discussion);

  return (
    <article className={clsx("group relative grid h-fit overflow-hidden", cardBase, cardHover)}>
      {discussion.image && (
        <div className={clsx("relative w-full overflow-hidden", CROPS[index % CROPS.length])}>
          <img
            src={discussion.image}
            alt={discussion.imageAlt ? pick(discussion.imageAlt, lang) : ""}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out-soft)] group-hover:scale-[1.03]"
          />
        </div>
      )}

      <div className="grid gap-3 p-[var(--space-4)]">
        <div className="relative z-[1] flex items-center justify-between gap-2">
          <MemberButton member={author} size="xs" sub={<TimeAgo minutesAgo={discussion.minutesAgo} />} />
          <SaveButton discussionId={discussion.id} />
        </div>

        <h3 className="text-[length:var(--text-body-md)] font-semibold leading-[var(--leading-snug)]">
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

        <p className="m-0 line-clamp-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {pick(discussion.body[0], lang)}
        </p>

        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-2">
          <ReactionBar targetId={discussion.id} counts={discussion.reactions} size="sm" />
          <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] font-semibold tabular-nums text-[var(--text-muted)]">
            <MessageCircle size={13} aria-hidden="true" />
            {t("community.replyCount", { count: replies })}
          </span>
        </div>
      </div>
    </article>
  );
}
