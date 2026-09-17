import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, Images, ScrollText, Sparkles, Users } from "lucide-react";
import clsx from "clsx";
import {
  ACTIVE_MEMBERS,
  CHANNELS,
  COMMUNITY_STATS,
  GUIDELINES,
  MEMBERS,
} from "../../data/community";
import { pick } from "../../data/types";
import { formatCount } from "../../lib/format";
import { useCommunity, VIEWER_ID } from "../../lib/community";
import { AvatarStack } from "../../components/community/MemberAvatar";
import { MemberButton } from "../../components/community/MemberProfile";
import { DiscussionCard } from "../../components/community/DiscussionCard";
import { ShowcaseCard } from "../../components/community/ShowcaseCard";
import { CommunityStats } from "../../components/community/CommunityStats";
import { StartDiscussionButton } from "../../components/community/NewDiscussion";
import { CHANNEL_ICONS, TONE_SOFT } from "../../components/community/channelStyle";
import { channelPath, GUIDELINES_PATH, MEMBERS_PATH } from "../../components/community/routes";
import { cardBase, cardHover, focusRing } from "../../components/community/styles";

/**
 * The community's front page.
 *
 * It answers one question before anything else: is anyone here? So the order is
 * welcome, figures, what is being said right now, what was made this week, and
 * only then the list of rooms. A directory of empty channels at the top would
 * say the opposite.
 *
 * The contextual column appears at `xl` only. Below that its content is not
 * dropped but folded underneath, because "who is around" is exactly what a new
 * member scrolls for.
 */
export function CommunityHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { discussions, discussionsIn } = useCommunity();

  const featured = discussions.filter((d) => d.featured || d.authorId === VIEWER_ID).slice(0, 4);
  const creations = discussionsIn("showcase").filter((d) => d.image).slice(0, 3);
  const newcomers = MEMBERS.filter((m) => m.badges.includes("new")).slice(0, 3);

  return (
    <>
      {/* Welcome. The one place on these screens with the decorative script. */}
      <section className="relative overflow-hidden rounded-[var(--radius-xl)] border border-[var(--gt-blue-200)] bg-[var(--surface-brand-wash)] p-[clamp(20px,4vw,44px)]">
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-5">
            <span className="gt-eyebrow flex items-center gap-2">
              <Sparkles size={13} aria-hidden="true" />
              {t("community.eyebrow")}
            </span>
            <div className="grid gap-3">
              <h1 className="max-w-[16ch] text-[length:var(--text-display-2)] leading-[var(--leading-tight)]">
                {t("community.homeTitle")}
              </h1>
              <p className="gt-script m-0 text-[clamp(28px,4vw,40px)] text-[var(--gt-blue-600)]">
                {t("community.homeMotto")}
              </p>
            </div>
            <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-lg)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">
              {t("community.homeIntro")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <StartDiscussionButton />
              <Link
                to={channelPath("showcase")}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-[var(--radius-pill)] px-4 py-2.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)] transition-colors hover:text-[var(--accent-highlight-ink)]",
                  focusRing,
                )}
              >
                {t("community.homeSeeCreations")}
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <AvatarStack members={ACTIVE_MEMBERS} max={6} />
              <span className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                {t("community.homeActiveLine", {
                  count: COMMUNITY_STATS.activeThisWeek,
                  value: formatCount(COMMUNITY_STATS.activeThisWeek),
                })}
              </span>
            </div>
          </div>

          <div className="gt-sparkle hidden h-[260px] w-[220px] overflow-hidden rounded-[var(--radius-lg)] lg:block">
            <img
              src={creations[0]?.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </section>

      <CommunityStats />

      <div className="grid items-start gap-[clamp(20px,3vw,32px)] xl:grid-cols-[minmax(0,1fr)_296px]">
        <div className="grid min-w-0 gap-[clamp(20px,3vw,32px)]">
          <section className="grid gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid gap-1.5">
                <span className="gt-eyebrow">{t("community.homeFeaturedEyebrow")}</span>
                <h2 className="text-[length:var(--text-h3)]">{t("community.homeFeaturedTitle")}</h2>
              </div>
              <Link
                to={channelPath("general")}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
                  focusRing,
                )}
              >
                {t("community.homeAllDiscussions")}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </header>

            <div className="grid gap-4">
              {featured.map((discussion) => (
                <DiscussionCard key={discussion.id} discussion={discussion} showChannel />
              ))}
            </div>
          </section>

          <section className="grid gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid gap-1.5">
                <span className="gt-eyebrow flex items-center gap-2">
                  <Images size={13} aria-hidden="true" />
                  {t("community.homeWallEyebrow")}
                </span>
                <h2 className="text-[length:var(--text-h3)]">{t("community.homeWallTitle")}</h2>
              </div>
              <Link
                to={channelPath("showcase")}
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-1 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
                  focusRing,
                )}
              >
                {t("community.homeAllCreations")}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </header>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {creations.map((discussion, index) => (
                <ShowcaseCard key={discussion.id} discussion={discussion} index={index} />
              ))}
            </div>
          </section>

          <section className="grid gap-4">
            <div className="grid gap-1.5">
              <span className="gt-eyebrow">{t("community.homeChannelsEyebrow")}</span>
              <h2 className="text-[length:var(--text-h3)]">{t("community.homeChannelsTitle")}</h2>
            </div>

            <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
              {CHANNELS.map((channel) => {
                const Icon = CHANNEL_ICONS[channel.id];
                const count = discussionsIn(channel.id).length;
                return (
                  <li key={channel.id}>
                    <Link
                      to={channelPath(channel.id)}
                      className={clsx(
                        "group flex h-full items-start gap-3.5 p-[var(--space-4)]",
                        cardBase,
                        cardHover,
                        focusRing,
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={clsx(
                          "grid h-10 w-10 flex-none place-items-center rounded-[var(--radius-md)]",
                          TONE_SOFT[channel.tone],
                        )}
                      >
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <span className="grid min-w-0 gap-1">
                        <strong className="text-[length:var(--text-body-md)] text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent-highlight-ink)]">
                          {pick(channel.name, lang)}
                        </strong>
                        <span className="text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
                          {pick(channel.tagline, lang)}
                        </span>
                        <span className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
                          {t("community.discussionCount", { count })}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Who is around. Folded under the feed below xl rather than dropped. */}
        <aside className="grid gap-4 xl:sticky xl:top-[92px]">
          <section className={clsx("grid gap-3.5 p-[var(--space-5)]", cardBase)}>
            <h2 className="gt-eyebrow flex items-center gap-2">
              <Users size={13} aria-hidden="true" />
              {t("community.homeAroundTitle")}
            </h2>
            <ul className="m-0 grid list-none gap-2.5 p-0">
              {ACTIVE_MEMBERS.slice(0, 5).map((member) => (
                <li key={member.id}>
                  <MemberButton member={member} size="sm" sub={pick(member.role, lang)} />
                </li>
              ))}
            </ul>
            <Link
              to={MEMBERS_PATH}
              className={clsx(
                "inline-flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
                focusRing,
              )}
            >
              {t("community.homeAllMembers")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </section>

          <section className={clsx("grid gap-3.5 p-[var(--space-5)]", cardBase)}>
            <h2 className="gt-eyebrow flex items-center gap-2">
              <Sparkles size={13} aria-hidden="true" />
              {t("community.homeWelcomeTitle")}
            </h2>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {t("community.homeWelcomeBody")}
            </p>
            <ul className="m-0 grid list-none gap-2.5 p-0">
              {newcomers.map((member) => (
                <li key={member.id}>
                  <MemberButton member={member} size="sm" sub={member.location} />
                </li>
              ))}
            </ul>
            <Link
              to={channelPath("intros")}
              className={clsx(
                "inline-flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
                focusRing,
              )}
            >
              {t("community.homeSayHello")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </section>

          <section className={clsx("grid gap-3 p-[var(--space-5)]", cardBase)}>
            <h2 className="gt-eyebrow flex items-center gap-2">
              <ScrollText size={13} aria-hidden="true" />
              {t("community.homeGuidelinesTitle")}
            </h2>
            <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
              {pick(GUIDELINES[0].body, lang)}
            </p>
            <Link
              to={GUIDELINES_PATH}
              className={clsx(
                "inline-flex items-center gap-1.5 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]",
                focusRing,
              )}
            >
              {t("community.homeReadGuidelines")}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
