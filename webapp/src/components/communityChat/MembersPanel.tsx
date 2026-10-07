"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AtSign, ChevronDown, Lock, X } from "lucide-react";
import clsx from "clsx";
import { CHAT_SERVERS, CHAT_VIEWER_ID, type ChatMember } from "../../data/communityChat";
import { useChat } from "../../lib/communityChat/chatStore";
import { mentionedMembers, messagesToday, recentAuthors, timestampOf } from "../../lib/communityChat/chatLogic";
import { ChatAvatar, RoleBadge, ToolButton, focusRing, useChatTime, useNow } from "./primitives";
import { useLoungeUi } from "./loungeUi";
import { LanguageFlag } from "./LanguageFlag";

function MemberRow({ member }: { member: ChatMember }) {
  const { t } = useTranslation();
  const { openProfile } = useLoungeUi();
  return (
    <li>
      <button
        type="button"
        onClick={() => openProfile(member.id)}
        aria-label={`${t("lounge.message.openProfile", { name: member.name })} — ${t(`lounge.presence.${member.presence}`)}`}
        className={clsx(
          "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--gt-ink-100)]",
          member.presence === "offline" && "opacity-60 hover:opacity-100",
          focusRing,
        )}
      >
        <ChatAvatar member={member} size="sm" presence />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[var(--text-primary)]">{member.name}</span>
        {member.role && <RoleBadge role={member.role} />}
      </button>
    </li>
  );
}

function AvatarRow({ ids, empty }: { ids: string[]; empty?: string }) {
  const { memberOf } = useChat();
  const { openProfile } = useLoungeUi();
  const { t } = useTranslation();
  const members = ids.map((id) => memberOf(id)).filter((m): m is ChatMember => Boolean(m));
  if (members.length === 0) return empty ? <p className="m-0 text-[12.5px] text-[var(--text-subtle)]">{empty}</p> : null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      {members.slice(0, 8).map((member) => (
        <li key={member.id}>
          <button
            type="button"
            onClick={() => openProfile(member.id)}
            aria-label={t("lounge.message.openProfile", { name: member.name })}
            title={member.name}
            className={clsx("rounded-full", focusRing)}
          >
            <ChatAvatar member={member} size="sm" presence={member.id !== CHAT_VIEWER_ID} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The right column: who is here, and a little context about the current
 * conversation. Deliberately quiet — small type, no cards — so it never
 * competes with the conversation it describes.
 */
export function MembersPanel({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const { serverMembers, messages, currentChannel, currentConversation, viewer } = useChat();
  const { toggleMembers } = useLoungeUi();
  const { short } = useChatTime();
  const now = useNow();
  const [showOffline, setShowOffline] = useState(true);

  const { online, offline } = useMemo(() => {
    const everyone = [viewer, ...serverMembers.filter((m) => m.id !== CHAT_VIEWER_ID)];
    return {
      online: everyone.filter((m) => m.presence !== "offline"),
      offline: everyone.filter((m) => m.presence === "offline"),
    };
  }, [serverMembers, viewer]);

  const participants = recentAuthors(messages).slice(0, 8);
  const mentioned = mentionedMembers(messages).slice(0, 8);
  const today = messagesToday(messages);
  const last = messages[messages.length - 1];

  const close = onClose ?? toggleMembers;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--surface-chrome)]">
      <div className="flex h-14 flex-none items-center justify-between gap-2 border-b border-[var(--border-subtle)] pl-4 pr-2">
        <h2 className="m-0 text-[13px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
          {currentConversation ? t("lounge.members.dmWith") : t("lounge.members.heading")}
        </h2>
        <ToolButton icon={X} label={t("lounge.members.close")} onClick={close} size={32} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-6">
        {currentConversation ? (
          <section className="grid gap-3 px-2 pt-4">
            <div className="flex items-center gap-3">
              <ChatAvatar member={currentConversation.member} size="md" presence />
              <span className="grid min-w-0">
                <strong className="truncate text-[14px] text-[var(--text-primary)]">{currentConversation.member.name}</strong>
                <span className="text-[12px] text-[var(--text-muted)]">{t(`lounge.presence.${currentConversation.member.presence}`)}</span>
              </span>
            </div>
            <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--gt-blue-50)] p-3 text-[12.5px] leading-snug text-[var(--text-body)]">
              <Lock size={14} aria-hidden="true" className="mt-0.5 flex-none text-[var(--gt-blue-700)]" />
              {t("lounge.dm.privateNote", { name: currentConversation.member.name.split(" ")[0] })}
            </p>
            <div className="grid gap-1.5">
              <h3 className="m-0 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">{t("lounge.members.sharedLounges")}</h3>
              <p className="m-0 flex flex-wrap gap-1.5">
                {currentConversation.member.languages.map((id) => {
                  const lounge = CHAT_SERVERS.find((s) => s.id === id);
                  return lounge ? (
                    <span key={id} className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] px-2 py-0.5 text-[12px] text-[var(--text-body)]">
                      <LanguageFlag code={lounge.id} />
                      {lounge.name}
                    </span>
                  ) : null;
                })}
              </p>
            </div>
          </section>
        ) : (
          <>
            <section aria-labelledby="lounge-online" className="pt-3">
              <h3 id="lounge-online" className="m-0 px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
                {t("lounge.members.online", { count: online.length })}
              </h3>
              <ul className="m-0 grid list-none gap-px p-0">
                {online.map((member) => (
                  <MemberRow key={member.id} member={member} />
                ))}
              </ul>
            </section>
            {offline.length > 0 && (
              <section className="pt-3">
                <h3 className="m-0">
                  <button
                    type="button"
                    aria-expanded={showOffline}
                    onClick={() => setShowOffline((v) => !v)}
                    className={clsx("flex w-full items-center gap-1 rounded-[var(--radius-xs)] px-2 pb-1 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)] hover:text-[var(--text-primary)]", focusRing)}
                  >
                    {t("lounge.members.offline", { count: offline.length })}
                    <ChevronDown size={12} aria-hidden="true" className={clsx("transition-transform", !showOffline && "-rotate-90")} />
                  </button>
                </h3>
                {showOffline && (
                  <ul className="m-0 grid list-none gap-px p-0">
                    {offline.map((member) => (
                      <MemberRow key={member.id} member={member} />
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}

        {/* Context about the conversation on screen: secondary, compact. */}
        <section className="mx-2 mt-5 grid gap-4 border-t border-[var(--border-subtle)] pt-4">
          <h3 className="m-0 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
            {t("lounge.members.conversation")}
          </h3>

          {currentChannel && (
            <div className="grid gap-2">
              <p className="m-0 text-[12px] font-semibold text-[var(--text-body)]">{t("lounge.members.participants")}</p>
              <AvatarRow ids={participants} />
            </div>
          )}

          {currentChannel && (
            <div className="grid gap-2">
              <p className="m-0 flex items-center gap-1 text-[12px] font-semibold text-[var(--text-body)]">
                <AtSign size={12} aria-hidden="true" />
                {t("lounge.members.mentioned")}
              </p>
              <AvatarRow ids={mentioned} empty={t("lounge.members.nobodyMentioned")} />
            </div>
          )}

          <div className="grid gap-1.5">
            <p className="m-0 flex items-center gap-1 text-[12px] font-semibold text-[var(--text-body)]">
              <Activity size={12} aria-hidden="true" />
              {t("lounge.members.activity")}
            </p>
            <ul className="m-0 grid list-none gap-1 p-0 text-[12.5px] text-[var(--text-muted)]">
              <li>{t("lounge.members.messagesToday", { count: today })}</li>
              {currentChannel && <li>{t("lounge.members.messagesTotal", { count: messages.length })}</li>}
              {last && <li>{t("lounge.members.lastMessage", { time: short(timestampOf(last, now), now) })}</li>}
            </ul>
          </div>

        </section>
      </div>
    </div>
  );
}
