import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams } from "react-router-dom";
import { MessagesSquare, Users } from "lucide-react";
import clsx from "clsx";
import { getChannel, type Discussion } from "../../data/community";
import { pick } from "../../data/types";
import { formatCount } from "../../lib/format";
import { useCommunity } from "../../lib/community";
import { DiscussionCard } from "../../components/community/DiscussionCard";
import { ShowcaseCard } from "../../components/community/ShowcaseCard";
import { EmptyState } from "../../components/community/EmptyState";
import { StartDiscussionButton } from "../../components/community/NewDiscussion";
import { CHANNEL_ICONS, TONE_SOFT } from "../../components/community/channelStyle";
import { COMMUNITY_ROOT } from "../../components/community/routes";
import { focusRing } from "../../components/community/styles";

/**
 * One channel.
 *
 * Two presentations of the same content: a reading list everywhere, and a wall
 * in Show your work, where the point is to look rather than to read. Both open
 * the same thread, because a creation is a discussion with a photograph.
 *
 * The three sorts are the three questions a member actually arrives with — what
 * is new, what is busy, and what is still waiting for an answer. That last one
 * is the useful one for a community: it is how a question from a beginner gets
 * found before it goes cold.
 */

type Sort = "latest" | "busiest" | "unanswered";

const SORTS: Sort[] = ["latest", "busiest", "unanswered"];

export function Channel() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { channelId = "" } = useParams();
  const { discussionsIn, replyCountOf } = useCommunity();
  const [sort, setSort] = useState<Sort>("latest");

  const channel = getChannel(channelId);
  if (!channel) return <Navigate to={COMMUNITY_ROOT} replace />;

  const all = discussionsIn(channel.id);
  const sorted = sortDiscussions(all, sort, replyCountOf);
  const Icon = CHANNEL_ICONS[channel.id];

  return (
    <>
      <header className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className={clsx(
                "grid h-12 w-12 flex-none place-items-center rounded-[var(--radius-lg)]",
                TONE_SOFT[channel.tone],
              )}
            >
              <Icon size={22} strokeWidth={1.75} />
            </span>
            <div className="grid gap-2">
              <h1 className="text-[length:var(--text-h2)]">{pick(channel.name, lang)}</h1>
              <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] leading-[var(--leading-relaxed)] text-[var(--text-muted)]">
                {pick(channel.intro, lang)}
              </p>
              <p className="m-0 flex flex-wrap items-center gap-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <MessagesSquare size={13} aria-hidden="true" />
                  {t("community.discussionCount", { count: all.length })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} aria-hidden="true" />
                  {t("community.channelMembers", { count: channel.members, value: formatCount(channel.members) })}
                </span>
              </p>
            </div>
          </div>

          <StartDiscussionButton
            channelId={channel.id}
            label={channel.layout === "gallery" ? t("community.shareCreation") : undefined}
          />
        </div>

        {all.length > 0 && (
          <div
            role="group"
            aria-label={t("community.sortLabel")}
            className="gt-scroller -mx-1 flex min-w-0 gap-2 px-1 pb-1"
          >
            {SORTS.map((option) => {
              const active = option === sort;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSort(option)}
                  className={clsx(
                    "h-9 flex-none rounded-[var(--radius-pill)] border px-4 text-[length:var(--text-caption)] font-semibold transition-colors duration-[var(--duration-fast)]",
                    focusRing,
                    active
                      ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:border-[var(--border-default)]",
                  )}
                >
                  {t(`community.sort.${option}`)}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {sorted.length === 0 ? (
        <EmptyState
          icon={Icon}
          tone={channel.tone}
          title={all.length === 0 ? t("community.emptyChannelTitle") : t("community.emptyAnsweredTitle")}
          body={
            all.length === 0
              ? t("community.emptyChannelBody", { channel: pick(channel.name, lang) })
              : t("community.emptyAnsweredBody")
          }
          action={
            all.length === 0 ? (
              <StartDiscussionButton channelId={channel.id} />
            ) : (
              <button
                type="button"
                onClick={() => setSort("latest")}
                className={clsx(
                  "rounded-[var(--radius-pill)] border border-[var(--border-strong)] px-5 py-2.5 text-[length:var(--text-body-sm)] font-semibold uppercase tracking-[var(--tracking-wide)] text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]",
                  focusRing,
                )}
              >
                {t("community.emptyAnsweredCta")}
              </button>
            )
          }
        />
      ) : channel.layout === "gallery" ? (
        /* The wall. CSS columns rather than a grid: a masonry composition is
           what stops nine photographs from reading as a contact sheet. */
        <div className="columns-1 gap-5 sm:columns-2 xl:columns-3">
          {sorted.map((discussion, index) => (
            <div key={discussion.id} className="mb-5 break-inside-avoid">
              <ShowcaseCard discussion={discussion} index={index} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {sorted.map((discussion) => (
            <DiscussionCard key={discussion.id} discussion={discussion} />
          ))}
        </div>
      )}
    </>
  );
}

/** Pinned threads stay on top of every sort: that is what pinning means. */
function sortDiscussions(
  discussions: Discussion[],
  sort: Sort,
  replyCountOf: (discussion: Discussion) => number,
): Discussion[] {
  const list = sort === "unanswered" ? discussions.filter((d) => replyCountOf(d) === 0) : [...discussions];

  list.sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (sort === "busiest") return replyCountOf(b) - replyCountOf(a);
    return a.minutesAgo - b.minutesAgo;
  });

  return list;
}
