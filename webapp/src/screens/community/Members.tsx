import { useTranslation } from "react-i18next";
import { MapPin, Users } from "lucide-react";
import clsx from "clsx";
import { COMMUNITY_STATS } from "../../data/community";
import { pick } from "../../data/types";
import { formatCount } from "../../lib/format";
import { directoryMembers, useCommunity } from "../../lib/community";
import { MemberAvatar } from "../../components/community/MemberAvatar";
import { MemberBadges } from "../../components/community/MemberBadges";
import { useMemberProfile } from "../../components/community/MemberProfile";
import { cardBase, cardHover, focusRing } from "../../components/community/styles";

/**
 * The artists in the room.
 *
 * Sorted by contributions because that is the only ordering the fixtures can
 * honestly support, and shown without the number ranked or displayed as a
 * position: no leaderboard, no levels. Each card is one button, so a name is
 * the same control here as anywhere else in the community.
 */
export function Members() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { openProfile } = useMemberProfile();
  const { viewer } = useCommunity();

  const members = [viewer, ...directoryMembers()];

  return (
    <>
      <header className="grid gap-2">
        <span className="gt-eyebrow flex items-center gap-2">
          <Users size={13} aria-hidden="true" />
          {t("community.navGroupAbout")}
        </span>
        <h1 className="text-[length:var(--text-h2)]">{t("community.membersTitle")}</h1>
        <p className="m-0 max-w-[var(--max-width-prose)] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("community.membersBody", {
            count: COMMUNITY_STATS.artists,
            value: formatCount(COMMUNITY_STATS.artists),
          })}
        </p>
      </header>

      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              onClick={() => openProfile(member.id)}
              aria-label={t("community.openProfileOf", { name: member.name })}
              className={clsx(
                "grid h-full w-full gap-3 p-[var(--space-5)] text-left",
                cardBase,
                cardHover,
                focusRing,
              )}
            >
              <div className="flex items-center gap-3">
                <MemberAvatar member={member} size="md" presence />
                <span className="grid min-w-0 gap-0.5">
                  <strong className="truncate text-[length:var(--text-body-md)] text-[var(--text-primary)]">
                    {member.name}
                  </strong>
                  <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    {pick(member.role, lang)}
                  </span>
                </span>
              </div>

              {member.location && (
                <span className="inline-flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                  <MapPin size={12} aria-hidden="true" />
                  {member.location}
                </span>
              )}

              <MemberBadges badges={member.badges} max={2} />

              <span className="text-[length:var(--text-caption)] tabular-nums text-[var(--text-muted)]">
                {t("community.contributionCount", { count: member.contributions })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
