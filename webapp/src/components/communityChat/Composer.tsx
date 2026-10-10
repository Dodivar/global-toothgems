"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Lock, SendHorizontal, Smile, X, CornerUpLeft } from "lucide-react";
import clsx from "clsx";
import type { ChatAttachment, ChatMember } from "../../lib/communityChat/model";
import { useChat } from "../../lib/communityChat/chatStore";
import {
  activeMentionQuery,
  insertMention,
  mentionCandidates,
  parseComposerText,
  plainText,
} from "../../lib/communityChat/chatLogic";
import { ChatAvatar, Popover, RoleBadge, ToolButton, focusRing } from "./primitives";

/** A small, warm set: the composer is not an emoji keyboard. */
const EMOJIS = ["😊", "😂", "🥰", "😍", "🙏", "👏", "🙌", "👍", "💪", "🤔", "😅", "😮", "✨", "💎", "💖", "💜", "💚", "🔥", "🌟", "🦷", "📸", "💅", "☕", "🎉"];

const MAX_ATTACHMENTS = 4;
/** The `lounge-media` bucket's limit and types (migration `members_lounge`). */
const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/**
 * The message composer: text, @mentions, emoji, images, and the reply it is
 * part of. What is typed is kept per room in the store, so switching channels
 * never loses a half-written message. Enter sends; Shift + Enter breaks the
 * line; while the mention list is open, the arrows move in it and Enter or
 * Tab picks.
 */
export function Composer() {
  const { t } = useTranslation();
  const {
    draft,
    setDraft,
    send,
    replyTarget,
    replyToMessage,
    memberOf,
    nameOf,
    serverMembers,
    currentChannel,
    currentConversation,
    composerFocus,
    typingMember,
    roomKey,
    viewer,
  } = useChat();
  /* One message at a time: the field stays as it is until the server took it. */
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hintId = useId();
  const errorId = useId();
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  /* Images and errors belong to the room they were picked in: switching rooms drops them. */
  const [picked, setPicked] = useState<{ room: string; list: ChatAttachment[]; error: string | null }>({ room: roomKey, list: [], error: null });
  const attachments = picked.room === roomKey ? picked.list : [];
  const error = picked.room === roomKey ? picked.error : null;
  const setAttachments = (update: (list: ChatAttachment[]) => ChatAttachment[]) =>
    setPicked((current) => ({ room: roomKey, list: update(current.room === roomKey ? current.list : []), error: current.room === roomKey ? current.error : null }));
  const setError = (message: string | null) =>
    setPicked((current) => ({ room: roomKey, list: current.room === roomKey ? current.list : [], error: message }));

  const roomName = currentChannel?.name ?? currentConversation?.member.name ?? "";
  const placeholder = currentConversation
    ? t("lounge.composer.placeholderDm", { name: roomName })
    : t("lounge.composer.placeholder", { room: roomName });

  /* Who can be mentioned here: the lounge's members, and the person of a private conversation. */
  const mentionable = useMemo(() => {
    const list: ChatMember[] = [...serverMembers];
    if (currentConversation && !list.some((m) => m.id === currentConversation.member.id)) list.unshift(currentConversation.member);
    return list.filter((m) => m.id !== viewer.id);
  }, [serverMembers, currentConversation, viewer.id]);

  const mention = activeMentionQuery(draft, caret);
  const candidates = mention && mention.start !== dismissedAt ? mentionCandidates(mention.query, mentionable) : [];
  const listOpen = Boolean(mention) && mention!.start !== dismissedAt;
  const active = candidates[Math.min(activeIndex, candidates.length - 1)];

  /* Something asked for the keyboard (Reply, Mention, Start the conversation). */
  useEffect(() => {
    if (composerFocus === 0) return;
    const node = field.current;
    if (!node) return;
    node.focus();
    const end = node.value.length;
    node.setSelectionRange(end, end);
    setCaret(end);
  }, [composerFocus]);

  /* Grows with the text, up to six lines, then scrolls. */
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 168)}px`;
  }, [draft]);

  const pick = (member: ChatMember) => {
    if (!mention) return;
    const next = insertMention(draft, mention.start, caret, member.handle);
    setDraft(next.text);
    setCaret(next.caret);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const insertAtCaret = (text: string) => {
    const node = field.current;
    const start = node?.selectionStart ?? draft.length;
    const end = node?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    const position = start + text.length;
    setCaret(position);
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(position, position);
    });
  };

  const canSend = !sending && (draft.trim().length > 0 || attachments.length > 0);

  const submit = async () => {
    if (!canSend) return;
    const parts = draft.trim() ? parseComposerText(draft.trim(), mentionable) : [];
    const sent = attachments;
    setSending(true);
    setError(null);
    const result = await send(parts, sent);
    setSending(false);
    if (!result.ok) {
      setError(t(result.reason === "rateLimited" ? "lounge.composer.rateLimited" : result.reason === "forbidden" ? "lounge.composer.forbidden" : "lounge.composer.failed"));
      return;
    }
    setPicked({ room: roomKey, list: [], error: null });
    setCaret(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (listOpen && candidates.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((index) => (index + delta + candidates.length) % candidates.length);
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && active) {
        event.preventDefault();
        pick(active);
        return;
      }
    }
    if (listOpen && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (mention) setDismissedAt(mention.start);
      return;
    }
    if (event.key === "Escape" && replyTarget) {
      event.preventDefault();
      replyToMessage(undefined);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      if (!IMAGE_TYPES.includes(file.type)) {
        setError(t("lounge.composer.notImage"));
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(t("lounge.composer.tooLarge"));
        continue;
      }
      if (attachments.length + next.length >= MAX_ATTACHMENTS) {
        setError(t("lounge.composer.tooMany"));
        break;
      }
      /* A local preview until it is sent; the file itself is uploaded with the message. */
      next.push({ kind: "image", src: URL.createObjectURL(file), name: file.name, alt: file.name, file });
    }
    setAttachments((list) => [...list, ...next]);
    if (fileInput.current) fileInput.current.value = "";
  };

  const removeAttachment = (attachment: ChatAttachment) => {
    URL.revokeObjectURL(attachment.src);
    setAttachments((list) => list.filter((a) => a !== attachment));
  };

  const replyAuthor = replyTarget ? memberOf(replyTarget.authorId) : undefined;

  return (
    <div className="flex-none px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1 sm:px-4">
      {/* "… is typing" sits right above the field, and is announced politely. */}
      <div aria-live="polite" className="flex h-5 items-center gap-1.5 px-1 text-[11.5px] text-[var(--text-muted)]">
        {typingMember && (
          <>
            <span aria-hidden="true" className="gt-lounge-typing inline-flex gap-0.5">
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
              <span className="h-1 w-1 rounded-full bg-current" />
            </span>
            <span>{t("lounge.composer.typing", { name: typingMember.name.split(" ")[0] })}</span>
          </>
        )}
      </div>

      <div className="relative rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[var(--shadow-xs)] transition-shadow focus-within:border-[var(--gt-blue-500)] focus-within:shadow-[var(--shadow-focus)]">
        {/* The mention list opens above the field, like the reply it might be part of. */}
        {listOpen && (
          <div className="absolute inset-x-2 bottom-[calc(100%+8px)] z-20 overflow-hidden rounded-[var(--radius-md)] border border-white/70 bg-white/95 p-1 shadow-[var(--shadow-lg)] backdrop-blur-[var(--glass-blur)]">
            <p className="m-0 px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-[var(--tracking-wide)] text-[var(--text-muted)]">
              {t("lounge.composer.mentionList")}
            </p>
            {candidates.length > 0 ? (
              <ul id={listId} role="listbox" aria-label={t("lounge.composer.mentionList")} className="m-0 grid list-none p-0">
                {candidates.map((member) => {
                  const selected = member === active;
                  return (
                    <li
                      key={member.id}
                      id={`${listId}-${member.id}`}
                      role="option"
                      aria-selected={selected}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(member);
                      }}
                      onMouseEnter={() => setActiveIndex(candidates.indexOf(member))}
                      className={clsx(
                        "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[length:var(--text-body-sm)]",
                        selected ? "bg-[var(--gt-blue-100)] text-[var(--text-primary)]" : "text-[var(--text-body)]",
                      )}
                    >
                      <ChatAvatar member={member} size="sm" presence />
                      <span className="font-semibold text-[var(--text-primary)]">{member.name}</span>
                      {member.role && <RoleBadge role={member.role} />}
                      <span className="ml-auto truncate text-[12px] text-[var(--text-muted)]">@{member.handle}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="m-0 px-2.5 py-2 text-[length:var(--text-body-sm)] text-[var(--text-muted)]">{t("lounge.composer.noMention")}</p>
            )}
          </div>
        )}

        {replyTarget && replyAuthor && (
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--gt-blue-50)] py-1.5 pl-3 pr-1.5 first:rounded-t-[var(--radius-lg)]">
            <CornerUpLeft size={14} strokeWidth={2.2} aria-hidden="true" className="flex-none text-[var(--gt-blue-600)]" />
            <p className="m-0 min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-muted)]">
              <strong className="font-semibold text-[var(--text-primary)]">{t("lounge.message.replyingTo", { name: replyAuthor.name })}</strong>
              <span aria-hidden="true"> · </span>
              <span>{plainText(replyTarget.parts, nameOf)}</span>
            </p>
            <ToolButton icon={X} label={t("lounge.composer.cancelReply")} onClick={() => replyToMessage(undefined)} size={28} />
          </div>
        )}

        {attachments.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-2 px-3 pt-3">
            {attachments.map((attachment) => (
              <li key={attachment.src} className="relative">
                <img src={attachment.src} alt={attachment.name} className="h-16 w-16 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] object-cover" />
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment)}
                  aria-label={t("lounge.composer.removeAttachment", { name: attachment.name })}
                  className={clsx("absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[var(--surface-inverse)] text-white shadow-[var(--shadow-sm)]", focusRing)}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-1 p-1.5">
          <input
            ref={fileInput}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => onFiles(event.target.files)}
          />
          <ToolButton icon={ImagePlus} label={t("lounge.composer.attach")} onClick={() => fileInput.current?.click()} size={38} />

          <textarea
            ref={field}
            rows={1}
            value={draft}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-describedby={error ? errorId : hintId}
            aria-autocomplete="list"
            aria-controls={listOpen && candidates.length > 0 ? listId : undefined}
            aria-activedescendant={listOpen && active ? `${listId}-${active.id}` : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setCaret(event.target.selectionStart ?? event.target.value.length);
              setActiveIndex(0);
              setDismissedAt(null);
            }}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
            onKeyDown={onKeyDown}
            className="max-h-[168px] min-h-[38px] flex-1 resize-none border-0 bg-transparent px-1.5 py-[9px] text-[15px] leading-[20px] text-[var(--text-primary)] placeholder:text-[var(--text-subtle)] focus:outline-none"
          />

          <Popover
            label={t("lounge.composer.emojiPicker")}
            side="top"
            align="end"
            width={264}
            trigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label={t("lounge.composer.emoji")}
                title={t("lounge.composer.emoji")}
                className={clsx("grid h-[38px] w-[38px] place-items-center rounded-[var(--radius-sm)] text-[var(--text-body)] hover:bg-[var(--gt-ink-100)] hover:text-[var(--text-primary)]", focusRing)}
              >
                <Smile size={19} strokeWidth={1.9} aria-hidden="true" />
              </button>
            )}
          >
            {(close) => (
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    data-popover-item
                    aria-label={emoji}
                    onClick={() => {
                      close();
                      insertAtCaret(emoji);
                    }}
                    className={clsx("grid h-8 w-8 place-items-center rounded-[var(--radius-sm)] text-[18px] hover:bg-[var(--gt-blue-50)]", focusRing)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </Popover>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            aria-busy={sending || undefined}
            aria-label={t("lounge.composer.send")}
            title={t("lounge.composer.send")}
            className={clsx(
              "grid h-[38px] w-[38px] flex-none place-items-center rounded-[var(--radius-md)] transition-colors",
              canSend
                ? "bg-[var(--accent-cta)] text-[var(--text-on-accent)] hover:bg-[var(--accent-cta-hover)]"
                : "bg-[var(--gt-ink-100)] text-[var(--text-subtle)]",
              focusRing,
            )}
          >
            <SendHorizontal size={18} strokeWidth={2.1} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-1.5 flex min-h-[16px] items-center gap-2 px-1 text-[11px] text-[var(--text-subtle)]">
        {error ? (
          <span id={errorId} role="alert" className="font-semibold text-[var(--status-error-fg)]">
            {error}
          </span>
        ) : (
          <span id={hintId} className="hidden sm:inline">
            {t("lounge.composer.hint")}
          </span>
        )}
        {currentConversation && (
          <span className="ml-auto inline-flex items-center gap-1">
            <Lock size={11} aria-hidden="true" />
            {t("lounge.dm.privateBadge")}
          </span>
        )}
      </div>
    </div>
  );
}
