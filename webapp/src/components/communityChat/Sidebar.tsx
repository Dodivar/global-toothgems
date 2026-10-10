"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BellOff, Check, CheckCheck, ChevronDown, FlaskConical, Globe2, Inbox, Plus, Search, Users } from "lucide-react";
import clsx from "clsx";
import { CHAT_VIEWER_ID, UPCOMING_SERVERS, type Presence } from "../../data/communityChat";
import { useChat, type ChannelView, type ConversationView } from "../../lib/communityChat/chatStore";
import { plainText, timestampOf } from "../../lib/communityChat/chatLogic";
import { AccessDemoSwitch } from "./AccessDemoSwitch";
import { ChatAvatar, CountBadge, Popover, PopoverItem, PresenceDot, ToolButton, focusRing, useChatTime, useNow } from "./primitives";
import { ChannelIcon } from "./channelIcons";
import { LanguageFlag } from "./LanguageFlag";
import { useLoungeUi } from "./loungeUi";
import { useMemberShellMenu } from "../layout/MemberShell";
import monogram from "../../assets/monogram-blue.png";

/* ----------------------------------------------------------- server switch */

/**
 * The language lounges. The current one is written in full on the trigger
 * ("English lounge", its flag, its size) so nobody wonders which room they are
 * in; the list shows each lounge's unread activity, and the lounges still to
 * open, so the community visibly has room to grow.
 */
export function ServerSwitcher() {
  const { t, i18n } = useTranslation();
  const { servers, server, selectServer, serverUnread } = useChat();
  const locale = i18n.language?.startsWith("fr") ? "fr-FR" : "en-GB";
  const count = (value: number) => new Intl.NumberFormat(locale).format(value);
  const current = t("lounge.server.current", { name: server.name });
  const otherActivity = servers.filter((s) => s.id !== server.id).some((s) => serverUnread(s.id).unread > 0);

  return (
    <Popover
      label={t("lounge.server.label")}
      width="100%"
      className="!left-0 !right-0 w-auto"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={t("lounge.server.switchAria", { name: server.name })}
          className={clsx(
            "gt-glass flex w-full items-center gap-3 rounded-[var(--radius-md)] !bg-white/70 px-3 py-2.5 text-left transition-colors hover:!bg-white",
            focusRing,
          )}
        >
          <span aria-hidden="true" className="relative grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-sm)] bg-[var(--gt-blue-100)]">
            <LanguageFlag code={server.id} className="!h-[16px] !w-[24px]" />
            <Globe2 size={13} strokeWidth={2.2} className="absolute -bottom-1 -right-1 rounded-full bg-white p-px text-[var(--gt-blue-700)]" />
          </span>
          <span className="grid min-w-0 flex-1">
            <span className="text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("lounge.server.label")}</span>
            <span className="truncate text-[15px] font-[var(--weight-black)] text-[var(--text-primary)]">{current}</span>
            <span className="text-[11.5px] text-[var(--text-muted)]">{t("lounge.server.members", { count: server.memberCount, formatted: count(server.memberCount) })}</span>
          </span>
          {otherActivity && <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-[var(--accent-highlight)]" />}
          <ChevronDown size={16} aria-hidden="true" className="flex-none text-[var(--text-muted)]" />
        </button>
      )}
    >
      {(close) => (
        <div className="grid gap-0.5">
          {servers.map((s) => {
            const activity = serverUnread(s.id);
            const active = s.id === server.id;
            return (
              <button
                key={s.id}
                type="button"
                data-popover-item
                aria-current={active ? "true" : undefined}
                onClick={() => {
                  selectServer(s.id);
                  close();
                }}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--gt-blue-50)] focus-visible:bg-[var(--gt-blue-50)] focus-visible:outline-none",
                  active && "bg-[var(--gt-blue-100)]",
                )}
              >
                <LanguageFlag code={s.id} className="!h-[14px] !w-[21px]" />
                <span className="grid min-w-0 flex-1">
                  <span className={clsx("text-[14px] text-[var(--text-primary)]", active ? "font-[var(--weight-black)]" : "font-semibold")}>{s.name}</span>
                  <span className="text-[11.5px] text-[var(--text-muted)]">
                    {t("lounge.server.members", { count: s.memberCount, formatted: count(s.memberCount) })}
                    {activity.unread > 0 && ` · ${t("lounge.server.unread", { count: activity.unread })}`}
                  </span>
                </span>
                {activity.mentions > 0 && <CountBadge count={activity.mentions} tone="mention" label={t("lounge.server.mentions", { count: activity.mentions })} />}
                {active && (
                  <>
                    <Check size={16} strokeWidth={2.4} aria-hidden="true" className="flex-none text-[var(--gt-emerald-600)]" />
                    <span className="sr-only">{t("lounge.server.active")}</span>
                  </>
                )}
              </button>
            );
          })}
          <div className="mt-1 border-t border-[var(--border-subtle)] px-2.5 pb-1.5 pt-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {UPCOMING_SERVERS.map((upcoming) => (
                <span
                  key={upcoming.code}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-dashed border-[var(--border-default)] px-2 py-0.5 text-[11.5px] text-[var(--text-muted)]"
                >
                  <LanguageFlag code={upcoming.code} />
                  {upcoming.name}
                  <span className="text-[10px] font-bold uppercase text-[var(--text-subtle)]">· {t("lounge.server.upcoming")}</span>
                </span>
              ))}
            </div>
            <p className="m-0 mt-2 text-[11.5px] leading-snug text-[var(--text-muted)]">{t("lounge.server.upcomingHint")}</p>
          </div>
        </div>
      )}
    </Popover>
  );
}

/* ---------------------------------------------------------------- channels */

function ChannelRow({ channel, active }: { channel: ChannelView; active: boolean }) {
  const { t } = useTranslation();
  const { openRoom } = useChat();
  const { closeNav } = useLoungeUi();
  const hasUnread = channel.unread > 0 && !channel.muted;

  return (
    <li>
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={() => {
          openRoom({ kind: "channel", channelId: channel.id });
          closeNav();
        }}
        className={clsx(
          "group relative flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-[7px] text-left text-[14px] transition-colors",
          active
            ? "bg-[var(--surface-brand-wash-strong)] font-bold text-[var(--text-primary)]"
            : hasUnread
              ? "font-bold text-[var(--text-primary)] hover:bg-[var(--gt-ink-100)]"
              : "font-medium text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]",
          channel.muted && !active && "opacity-60",
          focusRing,
        )}
      >
        {/* A pill on the edge for unread rooms, written out below for screen readers. */}
        {hasUnread && !active && <span aria-hidden="true" className="absolute -left-2 top-1/2 h-2 w-1 -translate-y-1/2 rounded-r-full bg-[var(--text-primary)]" />}
        {active && <span aria-hidden="true" className="absolute -left-2 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--gt-blue-600)]" />}
        <ChannelIcon channelKey={channel.key} size={17} className={active ? "text-[var(--gt-blue-700)]" : undefined} />
        <span className="min-w-0 flex-1 truncate">{channel.name}</span>
        {channel.muted && (
          <>
            <BellOff size={13} aria-hidden="true" />
            <span className="sr-only">{t("lounge.channels.muted")}</span>
          </>
        )}
        {channel.mentions > 0 && <CountBadge count={channel.mentions} tone="mention" label={t("lounge.channels.mentions", { count: channel.mentions })} />}
        {hasUnread && channel.mentions === 0 && <CountBadge count={channel.unread} label={t("lounge.channels.unread", { count: channel.unread })} />}
      </button>
    </li>
  );
}

function SectionHeading({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 pb-1 pt-4">
      <h2 className="m-0 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{children}</h2>
      {action}
    </div>
  );
}

export function ChannelList() {
  const { t } = useTranslation();
  const { channels, room, markServerRead, server, serverUnread } = useChat();
  const activity = serverUnread(server.id);
  return (
    <nav aria-label={t("lounge.channels.heading")}>
      <SectionHeading
        action={
          <ToolButton
            icon={CheckCheck}
            label={t("lounge.channels.markAllRead")}
            onClick={() => markServerRead(server.id)}
            disabled={activity.unread === 0 && activity.mentions === 0}
            size={26}
          />
        }
      >
        {t("lounge.channels.heading")}
      </SectionHeading>
      <ul className="m-0 grid list-none gap-px p-0">
        {channels.map((channel) => (
          <ChannelRow key={channel.id} channel={channel} active={room.kind === "channel" && room.channelId === channel.id} />
        ))}
      </ul>
    </nav>
  );
}

/* ----------------------------------------------------------------- private */

function ConversationRow({ view, active, now }: { view: ConversationView; active: boolean; now: number }) {
  const { t } = useTranslation();
  const { openRoom, nameOf } = useChat();
  const { closeNav } = useLoungeUi();
  const { short } = useChatTime();
  const last = view.last;
  const preview = last
    ? `${last.authorId === CHAT_VIEWER_ID ? t("lounge.dm.you") : ""}${plainText(last.parts, nameOf) || "📷"}`
    : t("lounge.dm.noMessages");
  const unread = view.unread > 0;

  return (
    <li>
      <button
        type="button"
        aria-current={active ? "page" : undefined}
        onClick={() => {
          openRoom({ kind: "dm", conversationId: view.conversation.id });
          closeNav();
        }}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors",
          active ? "bg-[var(--surface-brand-wash-strong)]" : "hover:bg-[var(--gt-ink-100)]",
          focusRing,
        )}
      >
        <ChatAvatar member={view.member} size="md" presence />
        <span className="grid min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={clsx("min-w-0 flex-1 truncate text-[14px] text-[var(--text-primary)]", unread || active ? "font-bold" : "font-semibold")}>{view.member.name}</span>
            {last && <span className="flex-none text-[11px] tabular-nums text-[var(--text-subtle)]">{short(timestampOf(last, now), now)}</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className={clsx("min-w-0 flex-1 truncate text-[12.5px]", unread ? "font-semibold text-[var(--text-body)]" : "text-[var(--text-muted)]")}>{preview}</span>
            <CountBadge count={view.unread} tone="accent" label={t("lounge.channels.unread", { count: view.unread })} />
          </span>
        </span>
      </button>
    </li>
  );
}

export function DirectMessageList() {
  const { t } = useTranslation();
  const { conversations, room } = useChat();
  const { openNewMessage } = useLoungeUi();
  const now = useNow();

  return (
    <nav aria-label={t("lounge.dm.heading")}>
      <SectionHeading action={<ToolButton icon={Plus} label={t("lounge.dm.new")} onClick={openNewMessage} size={26} />}>
        {t("lounge.dm.heading")}
      </SectionHeading>
      {conversations.length > 0 ? (
        <ul className="m-0 grid list-none gap-px p-0">
          {conversations.map((view) => (
            <ConversationRow
              key={view.conversation.id}
              view={view}
              now={now}
              active={room.kind === "dm" && room.conversationId === view.conversation.id}
            />
          ))}
        </ul>
      ) : (
        <div className="mx-1 grid justify-items-start gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--border-default)] p-3">
          <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{t("lounge.dm.empty")}</p>
          <button type="button" onClick={openNewMessage} className={clsx("text-[12.5px] font-bold text-[var(--text-primary)] underline underline-offset-2", focusRing)}>
            {t("lounge.dm.emptyCta")}
          </button>
        </div>
      )}
    </nav>
  );
}

/* --------------------------------------------------------------- user panel */

const STATUSES: Presence[] = ["online", "away", "offline"];

export function UserPanel() {
  const { t } = useTranslation();
  const { viewer, presence, setPresence } = useChat();
  const { openProfile } = useLoungeUi();
  const statusLabel = (value: Presence) => (value === "offline" ? t("lounge.presence.invisible") : t(`lounge.presence.${value}`));

  return (
    <div className="flex flex-none items-center gap-1 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 py-2">
      <button
        type="button"
        onClick={() => openProfile(viewer.id)}
        className={clsx("flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-left hover:bg-[var(--gt-ink-100)]", focusRing)}
      >
        <ChatAvatar member={viewer} size="md" presence />
        <span className="grid min-w-0">
          <span className="truncate text-[13.5px] font-bold text-[var(--text-primary)]">{viewer.name}</span>
          <span className="truncate text-[11.5px] text-[var(--text-muted)]">{statusLabel(presence)}</span>
        </span>
      </button>

      <Popover
        label={t("lounge.presence.change")}
        role="menu"
        side="top"
        align="end"
        width={200}
        trigger={(props) => (
          <button
            {...props}
            type="button"
            aria-label={`${t("lounge.presence.change")} — ${t("lounge.presence.yourStatus", { status: statusLabel(presence) })}`}
            title={t("lounge.presence.change")}
            className={clsx("grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] hover:bg-[var(--gt-ink-100)]", focusRing)}
          >
            <PresenceDot presence={presence} size="md" />
          </button>
        )}
      >
        {(close) => (
          <div className="grid">
            {STATUSES.map((status) => (
              <PopoverItem
                key={status}
                current={status === presence}
                onSelect={() => {
                  setPresence(status);
                  close();
                }}
                trailing={status === presence ? <Check size={15} aria-hidden="true" /> : undefined}
              >
                <span className="inline-flex items-center gap-2">
                  <PresenceDot presence={status} size="sm" />
                  {statusLabel(status)}
                </span>
              </PopoverItem>
            ))}
          </div>
        )}
      </Popover>

      {/* Prototype only: the same access preview as the Artist Community. */}
      <Popover
        label={t("community.demoTitle")}
        side="top"
        align="end"
        width={260}
        trigger={(props) => (
          <button
            {...props}
            type="button"
            aria-label={t("community.demoTitle")}
            title={t("community.demoTitle")}
            className={clsx("grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]", focusRing)}
          >
            <FlaskConical size={16} aria-hidden="true" />
          </button>
        )}
      >
        {() => <AccessDemoSwitch />}
      </Popover>
    </div>
  );
}

/* ----------------------------------------------------------------- sidebar */

/** The lounge's left column: identity, language lounge, search and inbox, rooms, you. */
export function ChatSidebar() {
  const { t } = useTranslation();
  const { unreadNotifications } = useChat();
  const { openSearch, openInbox, closeNav } = useLoungeUi();
  const shellMenu = useMemberShellMenu();

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-chrome)]">
      {/* Phones: the lounge replaces the member space's top bar, so the way
          back to the account's menu starts here. Desktop has the rail. */}
      {shellMenu && (
        <button
          type="button"
          onClick={() => {
            closeNav();
            shellMenu.openMenu();
          }}
          className={clsx(
            "flex flex-none items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 text-left transition-colors hover:bg-[var(--gt-ink-100)] lg:hidden",
            focusRing,
          )}
        >
          <ArrowLeft size={18} aria-hidden="true" className="flex-none text-[var(--text-body)]" />
          <span className="grid min-w-0">
            <span className="text-[14px] font-bold text-[var(--text-primary)]">{t("lounge.nav.backToSpace")}</span>
            <span className="text-[12px] text-[var(--text-muted)]">{t("lounge.nav.backToSpaceHint")}</span>
          </span>
        </button>
      )}
      <div className="grid flex-none grid-cols-[minmax(0,1fr)] gap-3 border-b border-[var(--border-subtle)] px-3 pb-3 pt-4">
        <div className="flex items-center gap-2.5 px-1">
          <img src={monogram.src} alt="" className="h-8 w-8 flex-none object-contain" />
          <span className="grid min-w-0">
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">{t("lounge.eyebrow")}</span>
            <span className="truncate text-[16px] font-[var(--weight-black)] leading-tight text-[var(--text-primary)]">{t("lounge.title")}</span>
          </span>
        </div>
        <ServerSwitcher />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={openSearch}
            className={clsx(
              "flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 text-[13px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-default)] hover:text-[var(--text-primary)]",
              focusRing,
            )}
          >
            <Search size={15} aria-hidden="true" />
            <span className="truncate">{t("lounge.search.placeholder")}</span>
          </button>
          <ToolButton
            icon={Inbox}
            label={unreadNotifications > 0 ? t("lounge.header.inboxCount", { count: unreadNotifications }) : t("lounge.header.inbox")}
            onClick={openInbox}
            badge={
              unreadNotifications > 0 ? (
                <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-[var(--accent-highlight-ink)] px-1 text-[10px] font-bold text-white">
                  {unreadNotifications}
                </span>
              ) : undefined
            }
          />
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-4">
        <ChannelList />
        <DirectMessageList />
        <div className="mt-5 grid gap-2 px-2.5">
          <p className="m-0 flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--text-muted)]">
            <Users size={12} aria-hidden="true" />
            {t("lounge.privateSpace")}
          </p>
          <p className="m-0 text-[11px] leading-snug text-[var(--text-subtle)]">{t("lounge.previewNote")}</p>
        </div>
      </div>

      <UserPanel />
    </div>
  );
}
