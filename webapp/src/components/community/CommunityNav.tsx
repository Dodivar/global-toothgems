import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";
import { Bookmark, Compass, MessageCircle, PenLine, ScrollText, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";
import { CHANNELS } from "../../data/community";
import { pick } from "../../data/types";
import { useCommunity } from "../../lib/community";
import { CHANNEL_ICONS } from "./channelStyle";
import { activityPath, channelPath, COMMUNITY_ROOT, GUIDELINES_PATH, MEMBERS_PATH } from "./routes";
import { focusRing } from "./styles";

/**
 * Navigation of the community.
 *
 * Three groups, in the order a member actually uses them: where the
 * conversations are, what they themselves have written, and who else is here.
 * The counts beside the channels are the point of the whole sidebar — a
 * navigation that never shows how much is going on is what makes a forum feel
 * abandoned — but they stay light: a muted number, never a red badge.
 *
 * Desktop renders the list; small screens render the same entries as two
 * scrollable rows, because a drawer would put the conversations one tap further
 * away on the device where most of them are read.
 */

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: number;
}

function useNavGroups(): Array<{ id: string; title: string; entries: NavEntry[] }> {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { discussionsIn, myDiscussions, myReplies, savedDiscussions } = useCommunity();

  const channels: NavEntry[] = [
    { to: COMMUNITY_ROOT, label: t("community.navHome"), icon: Compass, end: true },
    ...CHANNELS.map((channel) => ({
      to: channelPath(channel.id),
      label: pick(channel.name, lang),
      icon: CHANNEL_ICONS[channel.id],
      count: discussionsIn(channel.id).length,
    })),
  ];

  const activity: NavEntry[] = [
    { to: activityPath("discussions"), label: t("community.navMyDiscussions"), icon: PenLine, count: myDiscussions().length },
    { to: activityPath("reponses"), label: t("community.navMyReplies"), icon: MessageCircle, count: myReplies().length },
    { to: activityPath("enregistrees"), label: t("community.navSaved"), icon: Bookmark, count: savedDiscussions().length },
  ];

  const about: NavEntry[] = [
    { to: MEMBERS_PATH, label: t("community.navMembers"), icon: Users },
    { to: GUIDELINES_PATH, label: t("community.navGuidelines"), icon: ScrollText },
  ];

  return [
    { id: "channels", title: t("community.navGroupChannels"), entries: channels },
    { id: "activity", title: t("community.navGroupActivity"), entries: activity },
    { id: "about", title: t("community.navGroupAbout"), entries: about },
  ];
}

function SidebarEntry({ entry }: { entry: NavEntry }) {
  const Icon = entry.icon;
  return (
    <li>
      <NavLink
        to={entry.to}
        end={entry.end}
        className={({ isActive }) =>
          clsx(
            "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-[length:var(--text-body-sm)] font-semibold transition-colors duration-[var(--duration-fast)]",
            focusRing,
            isActive
              ? "bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
              : "text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
            <span className="flex-1 truncate">{entry.label}</span>
            {entry.count != null && entry.count > 0 && (
              <span
                aria-hidden="true"
                className={clsx(
                  "text-[length:var(--text-caption)] tabular-nums",
                  isActive ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]",
                )}
              >
                {entry.count}
              </span>
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}

export function CommunitySidebar() {
  const groups = useNavGroups();
  const { t } = useTranslation();

  return (
    <nav aria-label={t("community.navLabel")} className="hidden lg:grid lg:gap-5">
      {groups.map((group) => (
        <div key={group.id} className="grid gap-1.5">
          <h2 className="gt-eyebrow px-3">{group.title}</h2>
          <ul className="m-0 grid list-none gap-0.5 p-0">
            {group.entries.map((entry) => (
              <SidebarEntry key={entry.to} entry={entry} />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function PillEntry({ entry }: { entry: NavEntry }) {
  const Icon = entry.icon;
  return (
    <li>
      <NavLink
        to={entry.to}
        end={entry.end}
        className={({ isActive }) =>
          clsx(
            "flex h-10 items-center gap-2 whitespace-nowrap rounded-[var(--radius-pill)] border px-3.5 text-[length:var(--text-caption)] font-semibold transition-colors duration-[var(--duration-fast)]",
            focusRing,
            isActive
              ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
              : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)]",
          )
        }
      >
        {({ isActive }) => (
          <>
            <Icon size={14} strokeWidth={2} aria-hidden="true" />
            {entry.label}
            {entry.count != null && entry.count > 0 && (
              <span
                aria-hidden="true"
                className={clsx("tabular-nums", isActive ? "text-[var(--gt-ink-300)]" : "text-[var(--text-muted)]")}
              >
                {entry.count}
              </span>
            )}
          </>
        )}
      </NavLink>
    </li>
  );
}

export function CommunityMobileNav() {
  const groups = useNavGroups();
  const { t } = useTranslation();
  const [channels, ...rest] = groups;
  const secondary = rest.flatMap((group) => group.entries);

  return (
    <nav aria-label={t("community.navLabel")} className="grid gap-2 lg:hidden">
      {/* `min-w-0` keeps the rows from widening the grid column: without it the
          pills size the page and the whole community scrolls sideways. */}
      <ul className="gt-scroller m-0 flex min-w-0 list-none gap-2 p-0 pb-1">
        {channels.entries.map((entry) => (
          <PillEntry key={entry.to} entry={entry} />
        ))}
      </ul>
      <ul className="gt-scroller m-0 flex min-w-0 list-none gap-2 p-0 pb-1">
        {secondary.map((entry) => (
          <PillEntry key={entry.to} entry={entry} />
        ))}
      </ul>
    </nav>
  );
}
