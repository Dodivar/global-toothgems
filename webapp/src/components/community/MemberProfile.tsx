import { createContext, useCallback, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MapPin, MessageCircle } from "lucide-react";
import clsx from "clsx";
import { pick } from "../../data/types";
import type { Member } from "../../data/community";
import { formatMonthYear } from "../../lib/format";
import { useCommunity, VIEWER_ID } from "../../lib/community";
import { MemberAvatar, type AvatarSize } from "./MemberAvatar";
import { MemberBadges } from "./MemberBadges";
import { CommunityDialog } from "./Dialog";
import { TimeAgo } from "./TimeAgo";
import { focusRing } from "./styles";
import { discussionPath } from "./routes";

/**
 * Member identity, everywhere it appears.
 *
 * A name in this community is always the same control: it opens that artist's
 * card. Threading a callback down through every discussion card, reply and
 * gallery tile to do that would touch a dozen components, so the opener lives
 * in a small context that the community layout provides, next to the single
 * mounted dialog.
 */

interface MemberProfileContextValue {
  openProfile: (memberId: string) => void;
}

const MemberProfileContext = createContext<MemberProfileContextValue | null>(null);

export function MemberProfileProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openProfile = useCallback((memberId: string) => setOpenId(memberId), []);
  const value = useMemo(() => ({ openProfile }), [openProfile]);

  return (
    <MemberProfileContext.Provider value={value}>
      {children}
      {openId && <MemberProfileDialog memberId={openId} onClose={() => setOpenId(null)} />}
    </MemberProfileContext.Provider>
  );
}

export function useMemberProfile() {
  const ctx = useContext(MemberProfileContext);
  if (!ctx) throw new Error("useMemberProfile must be used within MemberProfileProvider");
  return ctx;
}

/** Avatar and name, as the button that opens the member's card. */
export function MemberButton({
  member,
  size = "sm",
  sub,
  className,
}: {
  member: Member;
  size?: AvatarSize;
  /** Second line under the name: a time, a channel, a role. */
  sub?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const { openProfile } = useMemberProfile();

  return (
    <button
      type="button"
      onClick={() => openProfile(member.id)}
      aria-label={t("community.openProfileOf", { name: member.name })}
      className={clsx(
        "-m-1 flex items-center gap-2.5 rounded-[var(--radius-md)] p-1 text-left transition-colors duration-[var(--duration-fast)] hover:bg-[var(--gt-ink-100)]",
        focusRing,
        className,
      )}
    >
      <MemberAvatar member={member} size={size} presence />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
          {member.name}
        </span>
        {sub && <span className="truncate text-[length:var(--text-caption)] text-[var(--text-muted)]">{sub}</span>}
      </span>
    </button>
  );
}

/** The artist's card: who they are, what they bring, what they last wrote. */
function MemberProfileDialog({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const titleId = useId();
  const { memberOf, discussions, replyCountOf } = useCommunity();

  const member = memberOf(memberId);
  const latest = discussions.filter((d) => d.authorId === member.id).slice(0, 3);
  const isViewer = member.id === VIEWER_ID;

  return (
    <CommunityDialog titleId={titleId} onClose={onClose} width="520px">
      <div className="flex items-start gap-4 pr-8">
        <MemberAvatar member={member} size="lg" presence />
        <div className="grid min-w-0 gap-1.5">
          <h2 id={titleId} className="text-[length:var(--text-h3)]">
            {member.name}
          </h2>
          <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{pick(member.role, lang)}</p>
          {member.location && (
            <p className="m-0 flex items-center gap-1.5 text-[length:var(--text-caption)] text-[var(--text-muted)]">
              <MapPin size={12} aria-hidden="true" />
              {member.location}
            </p>
          )}
        </div>
      </div>

      <MemberBadges badges={member.badges} size="sm" />

      <p className="m-0 text-[length:var(--text-body-sm)] leading-[var(--leading-relaxed)] text-[var(--text-body)]">
        {pick(member.bio, lang)}
      </p>

      <dl className="m-0 grid grid-cols-2 gap-3">
        <div className="grid gap-1 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3">
          <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
            {t("community.profileContributions")}
          </dt>
          <dd className="m-0 text-[length:var(--text-h4)] font-[var(--weight-black)] tabular-nums text-[var(--text-primary)]">
            {member.contributions}
          </dd>
        </div>
        <div className="grid gap-1 rounded-[var(--radius-md)] bg-[var(--surface-sunken)] p-3">
          <dt className="text-[length:var(--text-caption)] text-[var(--text-muted)]">{t("community.profileJoined")}</dt>
          <dd className="m-0 text-[length:var(--text-body-sm)] font-semibold text-[var(--text-primary)]">
            {formatMonthYear(member.joined)}
          </dd>
        </div>
      </dl>

      {latest.length > 0 ? (
        <section className="grid gap-2">
          <h3 className="gt-eyebrow">{t("community.profileLatest")}</h3>
          <ul className="m-0 grid list-none gap-1.5 p-0">
            {latest.map((discussion) => (
              <li key={discussion.id}>
                <Link
                  to={discussionPath(discussion.id)}
                  onClick={onClose}
                  className={clsx(
                    "flex items-baseline justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[length:var(--text-body-sm)] transition-colors hover:bg-[var(--gt-ink-100)]",
                    focusRing,
                  )}
                >
                  <span className="truncate font-semibold text-[var(--text-primary)]">
                    {pick(discussion.title, lang)}
                  </span>
                  <span className="flex flex-none items-center gap-1 text-[length:var(--text-caption)] text-[var(--text-muted)]">
                    <MessageCircle size={12} aria-hidden="true" />
                    {replyCountOf(discussion)}
                    <span aria-hidden="true">·</span>
                    <TimeAgo minutesAgo={discussion.minutesAgo} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="m-0 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] p-3 text-[length:var(--text-caption)] text-[var(--text-muted)]">
          {isViewer ? t("community.profileViewerEmpty") : t("community.profileEmpty", { name: member.name })}
        </p>
      )}
    </CommunityDialog>
  );
}
