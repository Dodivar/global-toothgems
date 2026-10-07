"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AtSign,
  Copy,
  CornerUpLeft,
  Hash,
  MessageCircle,
  MoreHorizontal,
  Reply,
  SmilePlus,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import {
  CHAT_REACTIONS,
  CHAT_REACTION_EMOJI,
  CHAT_VIEWER_ID,
  type ChatMessage,
  type ChatReaction,
  type MessagePart,
} from "../../data/communityChat";
import { useChat } from "../../lib/communityChat/chatStore";
import {
  continuesPrevious,
  dayKey,
  mentionsMember,
  plainText,
  reactionsOf,
  timestampOf,
} from "../../lib/communityChat/chatLogic";
import { ChatAvatar, Popover, PopoverItem, RoleBadge, focusRing, useChatTime, useNow } from "./primitives";
import { useLoungeUi } from "./loungeUi";
import { ChannelIcon } from "./channelIcons";

/* ------------------------------------------------------------ message text */

/** A message's text with its mentions as buttons that open the member's profile. */
export function MessageText({ parts, className }: { parts: readonly MessagePart[]; className?: string }) {
  const { t } = useTranslation();
  const { nameOf } = useChat();
  const { openProfile } = useLoungeUi();
  return (
    <p className={clsx("m-0 whitespace-pre-wrap break-words", className)}>
      {parts.map((part, index) =>
        part.type === "text" ? (
          <Fragment key={index}>{part.text}</Fragment>
        ) : (
          <button
            key={index}
            type="button"
            onClick={() => openProfile(part.memberId)}
            aria-label={t("lounge.message.openProfile", { name: nameOf(part.memberId) })}
            className={clsx(
              "rounded-[var(--radius-xs)] px-1 py-px font-semibold transition-colors",
              part.memberId === CHAT_VIEWER_ID
                ? "bg-[var(--gt-fuchsia-50)] text-[var(--accent-highlight-ink)] hover:bg-[var(--gt-fuchsia-300)]/40"
                : "bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)] hover:bg-[var(--gt-blue-200)]",
              focusRing,
            )}
          >
            @{nameOf(part.memberId)}
          </button>
        ),
      )}
    </p>
  );
}

/* ------------------------------------------------------------ reply quote */

/**
 * The compact parent shown above a reply: a connector drawn from the
 * avatar column, the parent's author and the start of their text. It is a
 * button — following it scrolls back to the original message.
 */
function ReplyQuote({ parent, authorName, onJump }: { parent?: ChatMessage; authorName?: string; onJump: () => void }) {
  const { t } = useTranslation();
  const { memberOf, nameOf } = useChat();
  const author = parent ? memberOf(parent.authorId) : undefined;

  return (
    <div className="relative mb-1 flex min-w-0 items-center pl-[52px]">
      {/* The connector: from above the avatar to the quote, like a branch. */}
      <span
        aria-hidden="true"
        className="absolute left-[19px] top-[10px] h-[12px] w-[26px] rounded-tl-[8px] border-l-2 border-t-2 border-[var(--gt-blue-300)]"
      />
      {parent && author ? (
        <button
          type="button"
          onClick={onJump}
          aria-label={t("lounge.message.jumpToOriginal", { name: authorName ?? "" })}
          className={clsx(
            "flex min-w-0 max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] py-0.5 pl-1 pr-2 text-[12.5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--gt-blue-50)] hover:text-[var(--text-primary)]",
            focusRing,
          )}
        >
          <CornerUpLeft size={12} strokeWidth={2.2} aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]" />
          <ChatAvatar member={author} size="xs" />
          <span className="flex-none font-semibold text-[var(--text-primary)]">{author.name}</span>
          <span className="min-w-0 truncate">{plainText(parent.parts, nameOf) || "…"}</span>
        </button>
      ) : (
        <span className="text-[12.5px] italic text-[var(--text-subtle)]">{t("lounge.message.replyMissing")}</span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- reactions */

function ReactionPicker({ onPick, trigger }: { onPick: (reaction: ChatReaction) => void; trigger: "toolbar" | "inline" }) {
  const { t } = useTranslation();
  return (
    <Popover
      label={t("lounge.reactions.picker")}
      align="end"
      side={trigger === "toolbar" ? "bottom" : "top"}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={t("lounge.message.react")}
          title={t("lounge.message.react")}
          className={clsx(
            trigger === "toolbar"
              ? "grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]"
              : "inline-flex h-7 items-center rounded-[var(--radius-pill)] border border-dashed border-[var(--border-default)] px-2 text-[var(--text-muted)] hover:border-[var(--gt-blue-400)] hover:text-[var(--text-primary)]",
            focusRing,
          )}
        >
          <SmilePlus size={trigger === "toolbar" ? 17 : 14} strokeWidth={1.9} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <div className="flex gap-0.5">
          {CHAT_REACTIONS.map((reaction) => {
            const label = t(`lounge.reactions.${reaction}`);
            return (
              <button
                key={reaction}
                type="button"
                data-popover-item
                aria-label={t("lounge.reactions.add", { label })}
                title={label}
                onClick={() => {
                  onPick(reaction);
                  close();
                }}
                className={clsx(
                  "grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-[19px] transition-transform hover:bg-[var(--gt-blue-50)] motion-safe:hover:scale-110",
                  focusRing,
                )}
              >
                <span aria-hidden="true">{CHAT_REACTION_EMOJI[reaction]}</span>
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

function Reactions({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const { react, reactionsMine } = useChat();
  const views = reactionsOf(message, reactionsMine(message));
  if (views.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {views.map(({ reaction, count, mine }) => {
        const label = t(`lounge.reactions.${reaction}`);
        return (
          <button
            key={reaction}
            type="button"
            aria-pressed={mine}
            aria-label={t("lounge.reactions.count", { label, count })}
            onClick={() => react(message, reaction)}
            className={clsx(
              "inline-flex h-7 items-center gap-1 rounded-[var(--radius-pill)] border px-2 text-[12px] font-semibold tabular-nums transition-colors",
              mine
                ? "border-[var(--gt-blue-500)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]"
                : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-body)] hover:border-[var(--gt-blue-300)]",
              focusRing,
            )}
          >
            <span aria-hidden="true" className="text-[14px] leading-none">
              {CHAT_REACTION_EMOJI[reaction]}
            </span>
            <span aria-hidden="true">{count}</span>
          </button>
        );
      })}
      <ReactionPicker trigger="inline" onPick={(reaction) => react(message, reaction)} />
    </div>
  );
}

/* ----------------------------------------------------------------- message */

/** Quick reactions offered straight in the hover toolbar. */
const QUICK: ChatReaction[] = ["heart", "clap", "sparkles"];

function MessageToolbar({ message, visible }: { message: ChatMessage; visible: boolean }) {
  const { t } = useTranslation();
  const { react, replyToMessage, nameOf, mention, memberOf, openConversationWith, room } = useChat();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const author = memberOf(message.authorId);
  const isMine = message.authorId === CHAT_VIEWER_ID;

  return (
    <div
      className={clsx(
        "absolute -top-4 right-3 z-10 flex items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-0.5 shadow-[var(--shadow-sm)] transition-opacity duration-[var(--duration-fast)]",
        visible ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
      )}
    >
      {QUICK.map((reaction) => (
        <button
          key={reaction}
          type="button"
          aria-label={t("lounge.reactions.add", { label: t(`lounge.reactions.${reaction}`) })}
          title={t(`lounge.reactions.${reaction}`)}
          onClick={() => react(message, reaction)}
          className={clsx("hidden h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-[15px] hover:bg-[var(--gt-blue-50)] sm:grid", focusRing)}
        >
          <span aria-hidden="true">{CHAT_REACTION_EMOJI[reaction]}</span>
        </button>
      ))}
      <ReactionPicker trigger="toolbar" onPick={(reaction) => react(message, reaction)} />
      <button
        type="button"
        onClick={() => replyToMessage(message)}
        aria-label={t("lounge.message.reply")}
        title={t("lounge.message.reply")}
        className={clsx("grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]", focusRing)}
      >
        <Reply size={17} strokeWidth={1.9} aria-hidden="true" />
      </button>
      <Popover
        label={t("lounge.message.more")}
        role="menu"
        align="end"
        width={236}
        trigger={(props) => (
          <button
            {...props}
            type="button"
            aria-label={t("lounge.message.more")}
            title={t("lounge.message.more")}
            className={clsx("grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]", focusRing)}
          >
            <MoreHorizontal size={17} strokeWidth={1.9} aria-hidden="true" />
          </button>
        )}
      >
        {(close) => (
          <div className="grid">
            <PopoverItem
              icon={Copy}
              onSelect={() => {
                void navigator.clipboard?.writeText(plainText(message.parts, nameOf)).then(() => setCopied(true), () => undefined);
                close();
              }}
            >
              {t("lounge.message.copy")}
            </PopoverItem>
            {!isMine && author && (
              <PopoverItem
                icon={AtSign}
                onSelect={() => {
                  close();
                  mention(author);
                }}
              >
                {t("lounge.message.mentionAuthor", { name: author.name })}
              </PopoverItem>
            )}
            {!isMine && author && room.kind === "channel" && (
              <PopoverItem
                icon={MessageCircle}
                onSelect={() => {
                  close();
                  openConversationWith(author.id);
                }}
              >
                {t("lounge.message.sendDm", { name: author.name })}
              </PopoverItem>
            )}
          </div>
        )}
      </Popover>
      {copied && (
        <span role="status" className="sr-only">
          {t("lounge.message.copied")}
        </span>
      )}
    </div>
  );
}

function MessageItem({
  message,
  grouped,
  now,
  highlighted,
  onJump,
}: {
  message: ChatMessage;
  grouped: boolean;
  now: number;
  highlighted: boolean;
  onJump: (messageId: string) => void;
}) {
  const { t } = useTranslation();
  const { memberOf, messages } = useChat();
  const { openProfile } = useLoungeUi();
  const { clock, day } = useChatTime();
  const [touched, setTouched] = useState(false);
  const author = memberOf(message.authorId);
  const parent = message.replyToId ? messages.find((m) => m.id === message.replyToId) : undefined;
  const parentAuthor = parent ? memberOf(parent.authorId) : undefined;
  const mentionsYou = message.authorId !== CHAT_VIEWER_ID && mentionsMember(message);
  const timestamp = timestampOf(message, now);
  const when = new Date(timestamp);
  const fullTime = `${day(timestamp, now)} · ${clock(timestamp)}`;

  if (!author) return null;

  return (
    <li
      id={`msg-${message.id}`}
      data-message-id={message.id}
      onPointerUp={(event) => {
        if (event.pointerType === "touch" && event.target === event.currentTarget) setTouched((v) => !v);
      }}
      className={clsx(
        "group relative scroll-mt-24 px-3 transition-colors duration-[var(--duration-normal)] sm:px-4",
        grouped ? "py-0.5" : "mt-3 pb-1 pt-1.5",
        mentionsYou
          ? "border-l-2 border-[var(--accent-highlight)] bg-[var(--gt-fuchsia-50)]/55 hover:bg-[var(--gt-fuchsia-50)]"
          : "border-l-2 border-transparent hover:bg-[var(--gt-blue-50)]",
        highlighted && "gt-lounge-flash",
      )}
    >
      {message.replyToId && <ReplyQuote parent={parent} authorName={author.name} onJump={() => parent && onJump(parent.id)} />}

      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
        {grouped ? (
          <time
            dateTime={when.toISOString()}
            title={fullTime}
            className="pt-[3px] text-right text-[10.5px] tabular-nums text-[var(--text-subtle)] opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            {clock(timestamp)}
          </time>
        ) : (
          <button
            type="button"
            onClick={() => openProfile(author.id)}
            aria-label={t("lounge.message.openProfile", { name: author.name })}
            className={clsx("h-10 w-10 self-start rounded-full", focusRing)}
          >
            <ChatAvatar member={author} size="md" />
          </button>
        )}

        <div className="min-w-0">
          {!grouped && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <button
                type="button"
                onClick={() => openProfile(author.id)}
                className={clsx("rounded-[var(--radius-xs)] text-[14.5px] font-bold text-[var(--text-primary)] hover:underline", focusRing)}
              >
                {author.name}
              </button>
              {author.role && <RoleBadge role={author.role} className="self-center" />}
              <time dateTime={when.toISOString()} title={fullTime} className="text-[11.5px] tabular-nums text-[var(--text-muted)]">
                {fullTime}
              </time>
              {mentionsYou && (
                <span className="inline-flex items-center gap-1 self-center text-[11px] font-semibold text-[var(--accent-highlight-ink)]">
                  <AtSign size={11} strokeWidth={2.4} aria-hidden="true" />
                  {t("lounge.message.mentionsYou")}
                </span>
              )}
            </div>
          )}
          {grouped && mentionsYou && <span className="sr-only">{t("lounge.message.mentionsYou")}</span>}
          {grouped && parentAuthor && <span className="sr-only">{t("lounge.message.replyingTo", { name: parentAuthor.name })}</span>}

          {!grouped && parentAuthor && <span className="sr-only">{t("lounge.message.replyingTo", { name: parentAuthor.name })}</span>}

          <MessageText parts={message.parts} className="text-[14.5px] leading-[1.55] text-[var(--text-body)]" />

          {message.attachments && message.attachments.length > 0 && (
            <div className={clsx("mt-2 grid max-w-[520px] gap-2", message.attachments.length > 1 && "grid-cols-2")}>
              {message.attachments.map((attachment) => (
                <figure key={attachment.src} className="m-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]">
                  <img
                    src={attachment.src}
                    alt={attachment.alt}
                    loading="lazy"
                    className="block max-h-[300px] w-full object-cover"
                  />
                </figure>
              ))}
            </div>
          )}

          <Reactions message={message} />
        </div>
      </div>

      <MessageToolbar message={message} visible={touched} />
    </li>
  );
}

/* ----------------------------------------------------------------- dividers */

function DayDivider({ label }: { label: string }) {
  return (
    <li role="separator" aria-label={label} className="mx-4 mb-1 mt-5 flex items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-subtle)]" />
      <span aria-hidden="true" className="text-[11px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
        {label}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-subtle)]" />
    </li>
  );
}

function NewDivider({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <li role="separator" aria-label={t("lounge.message.newDividerSr", { count })} data-new-divider className="relative mx-4 mt-3 flex items-center">
      <span aria-hidden="true" className="h-px flex-1 bg-[var(--accent-highlight)]" />
      <span aria-hidden="true" className="ml-2 rounded-[var(--radius-xs)] bg-[var(--accent-highlight-ink)] px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.06em] text-white">
        {t("lounge.message.newDivider")}
      </span>
    </li>
  );
}

/* -------------------------------------------------------------- room intro */

function RoomIntro() {
  const { t } = useTranslation();
  const { currentChannel, currentConversation } = useChat();
  const { openProfile } = useLoungeUi();

  if (currentConversation) {
    const member = currentConversation.member;
    return (
      <div className="grid justify-items-start gap-3 px-4 pb-2 pt-8 sm:px-6">
        <button type="button" onClick={() => openProfile(member.id)} aria-label={t("lounge.message.openProfile", { name: member.name })} className={clsx("rounded-full", focusRing)}>
          <ChatAvatar member={member} size="lg" presence />
        </button>
        <h3 className="m-0 text-[22px] font-[var(--weight-black)] text-[var(--text-primary)]">{member.name}</h3>
        <p className="m-0 max-w-[52ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">
          {t("lounge.dm.start", { name: member.name })} {t("lounge.dm.startHint")}
        </p>
      </div>
    );
  }

  if (!currentChannel) return null;
  return (
    <div className="grid justify-items-start gap-2 px-4 pb-2 pt-8 sm:px-6">
      <span className="grid h-14 w-14 place-items-center rounded-[var(--radius-lg)] bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
        <ChannelIcon channelKey={currentChannel.key} size={26} />
      </span>
      <h3 className="m-0 text-[22px] font-[var(--weight-black)] text-[var(--text-primary)]">{currentChannel.name}</h3>
      <p className="m-0 max-w-[60ch] text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{currentChannel.topic}</p>
    </div>
  );
}

/* ------------------------------------------------------------- empty state */

export function EmptyChannel({ onStart }: { onStart: () => void }) {
  const { t } = useTranslation();
  const { currentChannel } = useChat();
  return (
    <div className="grid flex-1 place-items-center px-6 py-10">
      <div className="grid max-w-[380px] justify-items-center gap-3 text-center">
        <span className="relative grid h-20 w-20 place-items-center rounded-full bg-[var(--gt-blue-100)] text-[var(--gt-blue-700)]">
          {currentChannel ? <ChannelIcon channelKey={currentChannel.key} size={30} /> : <Hash size={30} aria-hidden="true" />}
          <Sparkles size={18} aria-hidden="true" className="absolute -right-1 top-1 text-[var(--accent-highlight)]" />
        </span>
        <h3 className="m-0 text-[18px] font-[var(--weight-black)] leading-snug text-[var(--text-primary)]">{t("lounge.empty.channelTitle")}</h3>
        <p className="m-0 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("lounge.empty.channelBody")}</p>
        <button
          type="button"
          onClick={onStart}
          className={clsx(
            "mt-1 inline-flex h-10 items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--accent-cta)] px-5 text-[length:var(--text-body-sm)] font-bold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-cta-hover)]",
            focusRing,
          )}
        >
          <MessageCircle size={16} aria-hidden="true" />
          {t("lounge.empty.channelCta")}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- list */

/**
 * The conversation: one continuous stream, oldest at the top. Messages of one
 * author a few minutes apart are grouped under one name, the day is written
 * between days, and a "New" rule marks where the unread messages start.
 */
export function MessageList() {
  const { t } = useTranslation();
  const { messages, divider, roomKey, focus, currentChannel, currentConversation, focusComposer } = useChat();
  const now = useNow();
  const { day } = useChatTime();
  const scroller = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState<{ id: string; nonce: number } | null>(null);
  const roomLabel = currentChannel ? currentChannel.name : (currentConversation?.member.name ?? "");

  const dividerIndex = divider > 0 ? messages.length - divider : -1;

  const rows = useMemo(() => {
    const out: Array<{ kind: "day"; key: string; label: string } | { kind: "new"; count: number } | { kind: "message"; message: ChatMessage; grouped: boolean }> = [];
    let previousDay = "";
    messages.forEach((message, index) => {
      const ts = timestampOf(message, now);
      const key = dayKey(ts);
      const newDay = key !== previousDay;
      if (newDay) {
        out.push({ kind: "day", key, label: day(ts, now) });
        previousDay = key;
      }
      const isDivider = index === dividerIndex;
      if (isDivider) out.push({ kind: "new", count: divider });
      out.push({ kind: "message", message, grouped: !newDay && !isDivider && continuesPrevious(messages[index - 1], message, now) });
    });
    return out;
  }, [messages, now, day, dividerIndex, divider]);

  /*
   * Entering a room lands on the "New" rule if there is one, else at the end.
   * A new message in the same room is followed if the reader was at the end,
   * or if it is their own.
   */
  const seen = useRef<{ room: string; count: number } | null>(null);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const previous = seen.current;
    seen.current = { room: roomKey, count: messages.length };
    if (!previous || previous.room !== roomKey) {
      const marker = node.querySelector<HTMLElement>("[data-new-divider]");
      node.scrollTop = marker ? Math.max(0, marker.offsetTop - 96) : node.scrollHeight;
      return;
    }
    if (messages.length <= previous.count) return;
    const last = messages[messages.length - 1];
    const nearEnd = node.scrollHeight - node.scrollTop - node.clientHeight < 260;
    if (nearEnd || last.authorId === CHAT_VIEWER_ID) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      node.scrollTo({ top: node.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    }
  }, [roomKey, messages]);

  /* From search or the inbox: bring the message into view and flash it. */
  useEffect(() => {
    if (!focus) return;
    const target = document.getElementById(`msg-${focus.messageId}`);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    setFlash({ id: focus.messageId, nonce: focus.nonce });
    const timer = window.setTimeout(() => setFlash(null), 2200);
    return () => window.clearTimeout(timer);
  }, [focus]);

  const jumpTo = (messageId: string) => {
    const target = document.getElementById(`msg-${messageId}`);
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    setFlash({ id: messageId, nonce: Date.now() });
    window.setTimeout(() => setFlash(null), 2200);
  };

  if (messages.length === 0 && currentChannel) {
    return <EmptyChannel onStart={focusComposer} />;
  }

  return (
    <div
      ref={scroller}
      tabIndex={0}
      aria-label={t("lounge.message.list", { room: roomLabel })}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
    >
      <RoomIntro />
      <ol role="log" aria-label={t("lounge.message.list", { room: roomLabel })} className="m-0 list-none p-0">
        {rows.map((row) =>
          row.kind === "day" ? (
            <DayDivider key={`day-${row.key}`} label={row.label} />
          ) : row.kind === "new" ? (
            <NewDivider key="new" count={row.count} />
          ) : (
            <MessageItem
              key={row.message.id}
              message={row.message}
              grouped={row.grouped}
              now={now}
              highlighted={flash?.id === row.message.id}
              onJump={jumpTo}
            />
          ),
        )}
      </ol>
    </div>
  );
}
