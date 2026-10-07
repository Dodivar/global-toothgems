"use client";

import { useTranslation } from "react-i18next";
import { Bell, BellOff, Inbox, Lock, MessageCircle, PanelLeft, Search, Users } from "lucide-react";
import clsx from "clsx";
import { useChat } from "../../lib/communityChat/chatStore";
import { messagesToday } from "../../lib/communityChat/chatLogic";
import { ChatAvatar, ToolButton, focusRing } from "./primitives";
import { ChannelIcon } from "./channelIcons";
import { useLoungeUi } from "./loungeUi";

function Dot({ tone = "accent" }: { tone?: "accent" | "ink" }) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface-card)]",
        tone === "accent" ? "bg-[var(--accent-highlight-ink)]" : "bg-[var(--text-primary)]",
      )}
    />
  );
}

/**
 * Top of the conversation: which room this is (and, for a private one, that
 * it is private), how alive it is, and the room's controls. On phones it also
 * carries the doors to the channel drawer and the private messages, since the
 * sidebar is not on screen there.
 */
export function ConversationHeader() {
  const { t } = useTranslation();
  const { currentChannel, currentConversation, serverMembers, messages, muted, toggleMute, room, dmUnread, channels, unreadNotifications, viewer } = useChat();
  const { openNav, openSearch, openInbox, membersOpen, toggleMembers, openProfile } = useLoungeUi();
  const online = [viewer, ...serverMembers].filter((m) => m.presence !== "offline").length;
  const today = messagesToday(messages);
  const unreadElsewhere = channels.some((c) => !c.muted && c.unread > 0);

  return (
    <header className="flex h-14 flex-none items-center gap-1.5 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] pl-2 pr-2 sm:gap-2 sm:pl-4">
      <span className="lg:hidden">
        <ToolButton
          icon={PanelLeft}
          label={t("lounge.header.openNavigation")}
          onClick={() => openNav("channels")}
          badge={unreadElsewhere ? <Dot tone="ink" /> : undefined}
        />
      </span>

      {currentConversation ? (
        <button
          type="button"
          onClick={() => openProfile(currentConversation.member.id)}
          aria-label={t("lounge.message.openProfile", { name: currentConversation.member.name })}
          className={clsx("flex-none rounded-full", focusRing)}
        >
          <ChatAvatar member={currentConversation.member} size="sm" presence />
        </button>
      ) : (
        currentChannel && (
          <span className="hidden h-8 w-8 flex-none place-items-center rounded-[var(--radius-sm)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)] sm:grid">
            <ChannelIcon channelKey={currentChannel.key} size={17} />
          </span>
        )
      )}

      <div className="grid min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="m-0 truncate text-[15.5px] font-[var(--weight-black)] text-[var(--text-primary)]">
            {currentChannel?.name ?? currentConversation?.member.name}
          </h2>
          {currentConversation && (
            <span className="inline-flex flex-none items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-blue-100)] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[var(--gt-blue-700)]">
              <Lock size={10} strokeWidth={2.6} aria-hidden="true" />
              {t("lounge.dm.privateBadge")}
            </span>
          )}
          {muted && (
            <span className="inline-flex flex-none items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)]">
              <BellOff size={11} aria-hidden="true" />
              {t("lounge.channels.muted")}
            </span>
          )}
        </div>
        <p className="m-0 flex min-w-0 items-center gap-2 overflow-hidden text-[12px] text-[var(--text-muted)]">
          {currentChannel ? (
            <>
              <span className="inline-flex flex-none items-center gap-1">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--gt-emerald-500)]" />
                {t("lounge.header.online", { count: online })}
              </span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="hidden flex-none sm:inline">{today > 0 ? t("lounge.header.today", { count: today }) : t("lounge.header.quiet")}</span>
              <span aria-hidden="true" className="hidden xl:inline">·</span>
              <span className="hidden min-w-0 truncate xl:inline">{currentChannel.topic}</span>
            </>
          ) : (
            currentConversation && <span className="truncate">{t(`lounge.presence.${currentConversation.member.presence}`)}</span>
          )}
        </p>
      </div>

      <div className="flex flex-none items-center gap-0.5">
        <ToolButton icon={Search} label={t("lounge.header.search")} onClick={openSearch} />
        <span className="lg:hidden">
          <ToolButton
            icon={MessageCircle}
            label={dmUnread > 0 ? `${t("lounge.dm.heading")} — ${t("lounge.channels.unread", { count: dmUnread })}` : t("lounge.dm.heading")}
            onClick={() => openNav("messages")}
            badge={dmUnread > 0 ? <Dot /> : undefined}
          />
        </span>
        <span className="lg:hidden">
          <ToolButton
            icon={Inbox}
            label={unreadNotifications > 0 ? t("lounge.header.inboxCount", { count: unreadNotifications }) : t("lounge.header.inbox")}
            onClick={openInbox}
            badge={unreadNotifications > 0 ? <Dot /> : undefined}
          />
        </span>
        {room.kind === "channel" && (
          <span className="hidden sm:inline-flex">
            <ToolButton icon={muted ? BellOff : Bell} label={muted ? t("lounge.header.unmute") : t("lounge.header.mute")} pressed={muted} onClick={() => toggleMute(room)} />
          </span>
        )}
        <ToolButton
          icon={Users}
          label={membersOpen ? t("lounge.header.hideMembers") : t("lounge.header.showMembers")}
          pressed={membersOpen}
          onClick={toggleMembers}
        />
      </div>
    </header>
  );
}
