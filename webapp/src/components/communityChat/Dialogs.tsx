"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AtSign, CheckCheck, Inbox, UserRound, GraduationCap, Heart, Lock, MapPin, MessageCircle, Reply, Search, SearchX } from "lucide-react";
import clsx from "clsx";
import { Link } from "../../lib/navigation";
import { memberOfConversation, type ChatMember } from "../../lib/communityChat/model";
import { pick } from "../../data/types";
import { useChat, type ChatNotification, type NotificationKind } from "../../lib/communityChat/chatStore";
import { mentionCandidates, normalize, plainText, searchCommunity, timestampOf, type ChatRoom } from "../../lib/communityChat/chatLogic";
import { ChatAvatar, ChatDialog, RoleBadge, focusRing, useChatTime, useCountryName, useNow } from "./primitives";
import { LanguageFlag } from "./LanguageFlag";
import { ChannelIcon } from "./channelIcons";
import { useLoungeUi } from "./loungeUi";

const sectionTitle = "m-0 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]";

/* ----------------------------------------------------------------- profile */

/**
 * A member's card: who they are, where they work, what they trained in, how
 * present they are in the community — and the two things you can do from
 * there. Light on purpose; there is no full profile page.
 */
export function ProfileDialog({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { memberOf, openConversationWith, mention, room, servers, viewer } = useChat();
  const { closeNav } = useLoungeUi();
  const { monthYear, locale } = useChatTime();
  const countryName = useCountryName();
  const titleId = useId();
  const formatCount = (value: number) => new Intl.NumberFormat(locale).format(value);
  const member = memberOf(memberId);
  if (!member) return null;
  const isSelf = member.id === viewer.id;
  const lounges = member.languages.map((id) => servers.find((s) => s.id === id)).filter((s) => s !== undefined);
  const trainingLabel = (training: string) => t(`lounge.trainings.${training}`, { defaultValue: training });

  return (
    <ChatDialog titleId={titleId} onClose={onClose} width="400px">
      <div aria-hidden="true" className="h-[88px] flex-none bg-[linear-gradient(120deg,var(--gt-blue-200),var(--gt-blue-50)_55%,var(--gt-emerald-50))]" />
      <div className="-mt-10 grid gap-4 overflow-y-auto px-5 pb-5">
        <div className="flex items-end justify-between gap-3">
          <span className="rounded-full border-4 border-white bg-white">
            <ChatAvatar member={member} size="lg" presence />
          </span>
          <span className="mb-1 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] px-2.5 py-1 text-[12px] font-semibold text-[var(--text-body)]">
            {t(`lounge.presence.${member.presence}`)}
          </span>
        </div>

        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="m-0 text-[20px] font-[var(--weight-black)] text-[var(--text-primary)]">
              <span className="sr-only">{t("lounge.profile.title", { name: member.name })}: </span>
              {member.name}
            </h2>
            {member.role && <RoleBadge role={member.role} />}
          </div>
          {!isSelf && <p className="m-0 text-[12.5px] text-[var(--text-muted)]">@{member.handle}</p>}
          {member.city && (
            <p className="m-0 flex items-center gap-1.5 text-[13px] text-[var(--text-body)]">
              <MapPin size={13} aria-hidden="true" className="text-[var(--text-muted)]" />
              {member.city}
              {member.country && `, ${countryName(member.country)}`}
            </p>
          )}
        </div>

        {(isSelf || member.bio) && (
          <p className="m-0 text-[14px] leading-relaxed text-[var(--text-body)]">
            {isSelf ? t("lounge.profile.selfNote") : member.bio ? pick(member.bio, i18n.language) : null}
          </p>
        )}

        {!isSelf && member.trainings.length > 0 && (
          <section className="grid gap-2">
            <h3 className={sectionTitle}>{t("lounge.profile.trainings")}</h3>
            <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
              {member.trainings.map((training) => (
                <li key={training} className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--gt-emerald-300)] bg-[var(--gt-emerald-50)] px-2.5 py-1 text-[12px] font-semibold text-[var(--gt-emerald-600)]">
                  <GraduationCap size={13} aria-hidden="true" />
                  {trainingLabel(training)}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="grid gap-2">
          <h3 className={sectionTitle}>{t("lounge.profile.languages")}</h3>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {lounges.map((lounge) => (
              <li key={lounge.id} className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--gt-ink-100)] px-2.5 py-1 text-[12px] text-[var(--text-body)]">
                <LanguageFlag code={lounge.id} />
                {lounge.name}
              </li>
            ))}
          </ul>
        </section>

        {!isSelf && (
          <section className="grid gap-2">
            <h3 className={sectionTitle}>{t("lounge.profile.activity")}</h3>
            <dl className={clsx("m-0 grid gap-2 text-center", member.helpfulCount === undefined ? "grid-cols-2" : "grid-cols-3")}>
              {[
                [t("lounge.profile.statMessages"), formatCount(member.messageCount)],
                ...(member.helpfulCount === undefined ? [] : [[t("lounge.profile.statHelpful"), formatCount(member.helpfulCount)]]),
                [t("lounge.profile.statSince"), monthYear(member.joined)],
              ].map(([label, value]) => (
                <div key={label} className="grid gap-0.5 rounded-[var(--radius-md)] bg-[var(--surface-brand-wash)] px-2 py-2.5">
                  <dd className="m-0 text-[15px] font-[var(--weight-black)] capitalize text-[var(--text-primary)]">{value}</dd>
                  <dt className="text-[11px] leading-tight text-[var(--text-muted)]">{label}</dt>
                </div>
              ))}
            </dl>
          </section>
        )}

        {isSelf ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="m-0 flex-1 rounded-[var(--radius-md)] bg-[var(--gt-blue-50)] px-3 py-2 text-[13px] font-semibold text-[var(--gt-blue-700)]">{t("lounge.profile.self")}</p>
            <Link
              to="/compte/profil"
              onClick={onClose}
              className={clsx(
                "inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-white px-4 text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]",
                focusRing,
              )}
            >
              <UserRound size={15} aria-hidden="true" />
              {t("lounge.nav.myProfile")}
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                closeNav();
                openConversationWith(member.id);
              }}
              className={clsx(
                "inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] px-4 text-[14px] font-bold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-cta-hover)]",
                focusRing,
              )}
            >
              <MessageCircle size={16} aria-hidden="true" />
              {t("lounge.profile.sendMessage")}
            </button>
            {!(room.kind === "dm" && room.conversationId === `dm-${member.id}`) && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  mention(member);
                }}
                className={clsx(
                  "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border-default)] bg-white px-4 text-[14px] font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--gt-ink-100)]",
                  focusRing,
                )}
              >
                <AtSign size={15} aria-hidden="true" />
                {t("lounge.profile.mention")}
              </button>
            )}
          </div>
        )}
      </div>
    </ChatDialog>
  );
}

/* ------------------------------------------------------------- new message */

function MemberLine({ member, trailing }: { member: ChatMember; trailing?: ReactNode }) {
  const { t } = useTranslation();
  const countryName = useCountryName();
  return (
    <>
      <ChatAvatar member={member} size="md" presence />
      <span className="grid min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-bold text-[var(--text-primary)]">{member.name}</span>
          {member.role && <RoleBadge role={member.role} />}
        </span>
        <span className="truncate text-[12px] text-[var(--text-muted)]">
          {[member.city, member.country ? countryName(member.country) : undefined, t(`lounge.presence.${member.presence}`)].filter(Boolean).join(" · ")}
        </span>
      </span>
      {trailing}
    </>
  );
}

export function NewMessageDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { allMembers, conversations, openConversationWith, viewer } = useChat();
  const { closeNav } = useLoungeUi();
  const titleId = useId();
  const [query, setQuery] = useState("");
  const results = mentionCandidates(query, allMembers.filter((m) => m.id !== viewer.id), 50).sort((a, b) => {
    const rank = { online: 0, away: 1, offline: 2 } as const;
    return rank[a.presence] - rank[b.presence] || a.name.localeCompare(b.name);
  });
  const ongoing = new Set(conversations.map((c) => c.member.id));

  return (
    <ChatDialog titleId={titleId} onClose={onClose} width="460px" placement="top">
      <div className="grid gap-3 border-b border-[var(--border-subtle)] p-4 pr-14">
        <h2 id={titleId} className="m-0 text-[17px] font-[var(--weight-black)] text-[var(--text-primary)]">
          {t("lounge.newMessage.title")}
        </h2>
        <label className="relative block">
          <span className="sr-only">{t("lounge.newMessage.label")}</span>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("lounge.newMessage.placeholder")}
            autoComplete="off"
            className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-white pl-9 pr-3 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--gt-blue-500)] focus:outline-none focus:shadow-[var(--shadow-focus)]"
          />
        </label>
        <p className="m-0 text-[12px] text-[var(--text-muted)]">{t("lounge.newMessage.hint")}</p>
      </div>
      <div className="min-h-0 overflow-y-auto p-2" aria-live="polite">
        {results.length > 0 ? (
          <ul className="m-0 grid list-none gap-px p-0">
            {results.map((member) => (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    closeNav();
                    openConversationWith(member.id);
                  }}
                  className={clsx("flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--gt-blue-50)]", focusRing)}
                >
                  <MemberLine
                    member={member}
                    trailing={
                      ongoing.has(member.id) ? (
                        <span className="flex-none text-[11px] font-semibold text-[var(--text-muted)]">{t("lounge.newMessage.existing")}</span>
                      ) : undefined
                    }
                  />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <NoResults text={t("lounge.newMessage.empty", { query })} />
        )}
      </div>
    </ChatDialog>
  );
}

function NoResults({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
        <SearchX size={24} aria-hidden="true" />
      </span>
      <p className="m-0 max-w-[34ch] text-[14px] font-semibold text-[var(--text-primary)]">{text}</p>
      {hint && <p className="m-0 text-[12.5px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ search */

/** Wraps each matched word in a highlight, accents and case ignored. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return <>{text}</>;
  const folded = normalize(text);
  const marks: Array<[number, number]> = [];
  for (const word of words) {
    let from = 0;
    let at: number;
    while ((at = folded.indexOf(word, from)) !== -1) {
      marks.push([at, at + word.length]);
      from = at + word.length;
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  const out: ReactNode[] = [];
  let cursor = 0;
  marks.forEach(([start, end], index) => {
    if (start < cursor) return;
    out.push(text.slice(cursor, start));
    out.push(
      <mark key={index} className="rounded-[2px] bg-[var(--gt-blue-200)] px-px text-[var(--text-primary)]">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  out.push(text.slice(cursor));
  return <>{out}</>;
}

/** An excerpt around the first match, so the hit is visible in one line. */
function excerpt(text: string, query: string): string {
  const word = normalize(query).split(/\s+/).filter(Boolean)[0];
  if (!word) return text;
  const at = normalize(text).indexOf(word);
  if (at < 50) return text;
  return `…${text.slice(at - 36)}`;
}

export function SearchDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { server, channels, conversations, messagesOf, nameOf, memberOf, allMembers, openRoom } = useChat();
  const { openProfile, closeNav } = useLoungeUi();
  const { short } = useChatTime();
  const now = useNow();
  const titleId = useId();
  const [query, setQuery] = useState("");

  const scope = useMemo(
    () => ({
      rooms: [
        ...channels.map((c) => ({ room: { kind: "channel", channelId: c.id } as ChatRoom, label: c.name, messages: messagesOf({ kind: "channel", channelId: c.id }) })),
        ...conversations.map((c) => ({ room: { kind: "dm", conversationId: c.conversation.id } as ChatRoom, label: c.member.name, messages: messagesOf({ kind: "dm", conversationId: c.conversation.id }) })),
      ],
      members: allMembers,
      channels: channels.map((c) => ({ ...c, channelId: c.id })),
    }),
    [channels, conversations, messagesOf, allMembers],
  );

  const results = searchCommunity(query, scope, nameOf);
  const total = results.messages.length + results.members.length + results.channels.length;
  const suggestions = [channels[3]?.name, allMembers[0]?.name.split(" ")[0], channels[4]?.name].filter(Boolean) as string[];

  const go = (room: ChatRoom, messageId?: string) => {
    onClose();
    closeNav();
    openRoom(room, messageId);
  };

  const rowClass = clsx("flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--gt-blue-50)]", focusRing);

  return (
    <ChatDialog titleId={titleId} onClose={onClose} width="600px" placement="top">
      <div className="grid gap-2 border-b border-[var(--border-subtle)] p-3 pr-14">
        <h2 id={titleId} className="sr-only">
          {t("lounge.search.title")}
        </h2>
        <label className="relative block">
          <span className="sr-only">{t("lounge.search.label")}</span>
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("lounge.search.placeholder")}
            autoComplete="off"
            className="h-12 w-full rounded-[var(--radius-md)] border border-[var(--border-default)] bg-white pl-10 pr-3 text-[16px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:border-[var(--gt-blue-500)] focus:outline-none focus:shadow-[var(--shadow-focus)]"
          />
        </label>
        <p className="m-0 flex items-center gap-1.5 px-1 text-[12px] text-[var(--text-muted)]">
          <LanguageFlag code={server.id} />
          {t("lounge.search.scope", { server: server.name })}
          {query.trim() && (
            <span className="ml-auto font-semibold" aria-live="polite">
              {t("lounge.search.count", { count: total })}
            </span>
          )}
        </p>
      </div>

      <div className="min-h-0 overflow-y-auto p-2">
        {!query.trim() ? (
          <div className="grid gap-3 px-3 py-6">
            <p className="m-0 text-[13px] text-[var(--text-muted)]">{t("lounge.search.idle")}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-[var(--text-muted)]">{t("lounge.search.suggestions")}</span>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setQuery(suggestion)}
                  className={clsx("rounded-[var(--radius-pill)] border border-[var(--border-subtle)] bg-white px-3 py-1 text-[12.5px] text-[var(--text-body)] hover:border-[var(--gt-blue-400)]", focusRing)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : total === 0 ? (
          <NoResults text={t("lounge.search.empty")} hint={t("lounge.search.emptyHint")} />
        ) : (
          <div className="grid gap-3">
            {results.channels.length > 0 && (
              <section className="grid gap-1">
                <h3 className={clsx(sectionTitle, "px-2.5 pt-1")}>{t("lounge.search.channels")}</h3>
                <ul className="m-0 grid list-none p-0">
                  {results.channels.map((channel) => (
                    <li key={channel.id}>
                      <button type="button" onClick={() => go({ kind: "channel", channelId: channel.id })} className={rowClass}>
                        <span className="grid h-9 w-9 flex-none place-items-center rounded-[var(--radius-sm)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
                          <ChannelIcon channelKey={channel.key} size={17} />
                        </span>
                        <span className="grid min-w-0">
                          <span className="text-[14px] font-bold text-[var(--text-primary)]">
                            <Highlight text={channel.name} query={query} />
                          </span>
                          <span className="truncate text-[12px] text-[var(--text-muted)]">{channel.topic}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {results.members.length > 0 && (
              <section className="grid gap-1">
                <h3 className={clsx(sectionTitle, "px-2.5 pt-1")}>{t("lounge.search.members")}</h3>
                <ul className="m-0 grid list-none p-0">
                  {results.members.map((member) => (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          openProfile(member.id);
                        }}
                        className={clsx(rowClass, "items-center")}
                      >
                        <MemberLine member={member} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {results.messages.length > 0 && (
              <section className="grid gap-1">
                <h3 className={clsx(sectionTitle, "px-2.5 pt-1")}>{t("lounge.search.messages")}</h3>
                <ul className="m-0 grid list-none p-0">
                  {results.messages.map(({ room, label, message, text }) => {
                    const author = memberOf(message.authorId);
                    return (
                      <li key={message.id}>
                        <button type="button" onClick={() => go(room, message.id)} className={rowClass}>
                          {author && <ChatAvatar member={author} size="sm" />}
                          <span className="grid min-w-0 flex-1 gap-0.5">
                            <span className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-[var(--text-muted)]">
                              <strong className="text-[13px] text-[var(--text-primary)]">{author?.name}</strong>
                              <span className="inline-flex items-center gap-1">
                                {room.kind === "dm" && <Lock size={10} aria-hidden="true" />}
                                {t("lounge.search.inRoom", { room: label })}
                              </span>
                              <span>· {short(timestampOf(message, now), now)}</span>
                            </span>
                            <span className="line-clamp-2 text-[13.5px] leading-snug text-[var(--text-body)]">
                              <Highlight text={excerpt(text, query)} query={query} />
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </ChatDialog>
  );
}

/* ------------------------------------------------------------------- inbox */

const FILTERS: Array<"all" | NotificationKind> = ["all", "mention", "reply", "reaction", "dm"];

const KIND_ICON = { mention: AtSign, reply: Reply, reaction: Heart, dm: MessageCircle } as const;

export function InboxDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { notifications, readNotifications, openRoom, memberOf, nameOf, markRead, servers } = useChat();
  const { closeNav } = useLoungeUi();
  const { short } = useChatTime();
  const now = useNow();
  const titleId = useId();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const shown = notifications.filter((n) => filter === "all" || n.kind === filter);
  const unread = notifications.filter((n) => n.unread);

  const roomLabel = (notification: ChatNotification) => {
    if (notification.room.kind === "dm") return nameOf(memberOfConversation(notification.room.conversationId));
    const channelId = notification.room.channelId;
    const lounge = servers.find((s) => s.id === notification.serverId);
    const channel = lounge?.channels.find((c) => c.id === channelId);
    return [lounge?.name, channel?.name].filter(Boolean).join(" · ");
  };

  const title = (notification: ChatNotification) => {
    const name = nameOf(notification.actorId);
    switch (notification.kind) {
      case "mention":
        return t("lounge.inbox.mention", { name });
      case "reply":
        return t("lounge.inbox.reply", { name });
      case "reaction":
        return t("lounge.inbox.reaction", { count: notification.reactionCount ?? 0 });
      case "dm":
        return t("lounge.inbox.dm", { name });
    }
  };

  const open = (notification: ChatNotification) => {
    readNotifications([notification.id]);
    onClose();
    closeNav();
    openRoom(notification.room, notification.message.id);
  };

  const markAll = () => {
    readNotifications(unread.map((n) => n.id));
    for (const n of unread) if (n.kind === "dm") markRead(n.room);
  };

  return (
    <ChatDialog titleId={titleId} onClose={onClose} width="480px" placement="top">
      <div className="grid gap-3 border-b border-[var(--border-subtle)] p-4 pr-14">
        <div className="flex items-center gap-3">
          <h2 id={titleId} className="m-0 flex items-center gap-2 text-[17px] font-[var(--weight-black)] text-[var(--text-primary)]">
            <Inbox size={18} aria-hidden="true" />
            {t("lounge.inbox.title")}
          </h2>
          <button
            type="button"
            onClick={markAll}
            disabled={unread.length === 0}
            className={clsx("ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[12.5px] font-semibold text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] disabled:opacity-40", focusRing)}
          >
            <CheckCheck size={14} aria-hidden="true" />
            {t("lounge.inbox.markAll")}
          </button>
        </div>
        <div role="group" aria-label={t("lounge.inbox.title")} className="flex flex-wrap gap-1.5">
          {FILTERS.map((value) => {
            const count = value === "all" ? unread.length : unread.filter((n) => n.kind === value).length;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={clsx(
                  "inline-flex flex-none items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 py-1 text-[12.5px] font-semibold transition-colors",
                  filter === value
                    ? "border-transparent bg-[var(--surface-inverse)] text-[var(--text-inverse)]"
                    : "border-[var(--border-subtle)] bg-white text-[var(--text-body)] hover:border-[var(--border-default)]",
                  focusRing,
                )}
              >
                {t(`lounge.inbox.filters.${value}`)}
                {count > 0 && <span className="tabular-nums opacity-80">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <div className="grid justify-items-center gap-2 px-6 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--gt-emerald-50)] text-[var(--gt-emerald-600)]">
              <CheckCheck size={24} aria-hidden="true" />
            </span>
            <p className="m-0 max-w-[34ch] text-[13.5px] text-[var(--text-muted)]">{t("lounge.inbox.empty")}</p>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-px p-0">
            {shown.map((notification) => {
              const Icon = KIND_ICON[notification.kind];
              const actor = notification.actorId ? memberOf(notification.actorId) : undefined;
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => open(notification)}
                    className={clsx(
                      "flex w-full items-start gap-3 rounded-[var(--radius-sm)] px-2.5 py-2.5 text-left transition-colors hover:bg-[var(--gt-blue-50)]",
                      notification.unread && "bg-[var(--surface-brand-wash)]",
                      focusRing,
                    )}
                  >
                    <span className="relative flex-none">
                      {actor ? (
                        <ChatAvatar member={actor} size="md" />
                      ) : (
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)]">
                          <Heart size={17} aria-hidden="true" />
                        </span>
                      )}
                      <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-[var(--surface-inverse)] text-white">
                        <Icon size={10} strokeWidth={2.6} aria-hidden="true" />
                      </span>
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className={clsx("text-[13.5px] text-[var(--text-primary)]", notification.unread ? "font-bold" : "font-semibold")}>{title(notification)}</span>
                      <span className="line-clamp-2 text-[12.5px] leading-snug text-[var(--text-muted)]">{plainText(notification.message.parts, nameOf)}</span>
                      <span className="text-[11.5px] text-[var(--text-subtle)]">
                        {t("lounge.inbox.in", { room: roomLabel(notification) })} · {short(timestampOf(notification.message, now), now)}
                      </span>
                    </span>
                    {notification.unread && (
                      <>
                        <span aria-hidden="true" className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[var(--accent-highlight-ink)]" />
                        <span className="sr-only">{t("lounge.inbox.unread")}</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ChatDialog>
  );
}
