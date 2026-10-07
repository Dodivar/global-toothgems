import {
  CHAT_REACTIONS,
  CHAT_VIEWER_ID,
  type ChatMember,
  type ChatMessage,
  type ChatReaction,
  type MessagePart,
} from "../../data/communityChat";

/*
 * Pure rules of the Members' Lounge: no React, no state, no fixtures read
 * directly — everything is passed in, so the same functions keep working when
 * the messages come from a database instead of `data/communityChat.ts`.
 */

/* ------------------------------------------------------------------ rooms */

/** Where the conversation pane is: a channel of a lounge, or a private conversation. */
export type ChatRoom = { kind: "channel"; channelId: string } | { kind: "dm"; conversationId: string };

/** One string per room, for maps keyed by room. */
export function roomKey(room: ChatRoom): string {
  return room.kind === "channel" ? `channel:${room.channelId}` : `dm:${room.conversationId}`;
}

export function sameRoom(a: ChatRoom, b: ChatRoom): boolean {
  return roomKey(a) === roomKey(b);
}

/* -------------------------------------------------------------- reactions */

export interface ReactionView {
  reaction: ChatReaction;
  count: number;
  /** Whether the viewer is one of the people counted. */
  mine: boolean;
}

/**
 * The reactions under a message, with the viewer's current choice applied.
 * Seeded totals include the viewer's seeded reactions (`message.mine`), so a
 * reaction the viewer removed is taken out of the total, and one they added is
 * put in. Reactions nobody holds are left out.
 */
export function reactionsOf(message: ChatMessage, mine: readonly ChatReaction[] = message.mine ?? []): ReactionView[] {
  const seededMine = message.mine ?? [];
  const views: ReactionView[] = [];
  for (const reaction of CHAT_REACTIONS) {
    const seeded = message.reactions?.[reaction] ?? 0;
    const others = seeded - (seededMine.includes(reaction) ? 1 : 0);
    const isMine = mine.includes(reaction);
    const count = Math.max(0, others) + (isMine ? 1 : 0);
    if (count > 0) views.push({ reaction, count, mine: isMine });
  }
  return views;
}

/** Adds the reaction when absent, removes it when present. */
export function toggleReaction(list: readonly ChatReaction[], reaction: ChatReaction): ChatReaction[] {
  return list.includes(reaction) ? list.filter((r) => r !== reaction) : [...list, reaction];
}

/* --------------------------------------------------------------- mentions */

/** Lowercase, accents removed: "Inès" and "ines" match. */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * The `@word` being typed right before the caret, if any. An `@` only opens a
 * mention at the start of the text or after a space, so an e-mail address does
 * not open the list.
 */
export function activeMentionQuery(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([\p{L}\d._-]*)$/u.exec(before);
  if (!match) return null;
  return { query: match[2], start: caret - match[2].length - 1 };
}

/** Members whose first name, last name or handle starts with the query. */
export function mentionCandidates(query: string, members: readonly ChatMember[], limit = 6): ChatMember[] {
  const q = normalize(query);
  const matches = members.filter((member) => {
    if (!q) return true;
    const words = [...normalize(member.name).split(/\s+/), normalize(member.handle)];
    return words.some((word) => word.startsWith(q));
  });
  return matches.slice(0, limit);
}

/** The text with the mention typed at `start…caret` replaced by `@handle `. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  handle: string,
): { text: string; caret: number } {
  const inserted = `@${handle} `;
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length };
}

/**
 * Turns what was typed in the composer into message parts. `@handle` of a
 * known member becomes a mention token; anything else (an unknown handle, an
 * e-mail address) stays text. A trailing full stop is punctuation, not part
 * of the handle.
 */
export function parseComposerText(text: string, members: readonly ChatMember[]): MessagePart[] {
  const byHandle = new Map(members.map((member) => [member.handle.toLowerCase(), member.id]));
  const parts: MessagePart[] = [];
  const pattern = /(^|\s)@([a-z0-9._-]+)/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const pushText = (value: string) => {
    if (!value) return;
    const last = parts[parts.length - 1];
    if (last?.type === "text") last.text += value;
    else parts.push({ type: "text", text: value });
  };

  while ((match = pattern.exec(text))) {
    let handle = match[2];
    let trailing = "";
    while (/[._-]$/.test(handle)) {
      trailing = handle.slice(-1) + trailing;
      handle = handle.slice(0, -1);
    }
    const memberId = byHandle.get(handle.toLowerCase());
    const atIndex = match.index + match[1].length;
    if (!memberId) continue;
    pushText(text.slice(cursor, atIndex));
    parts.push({ type: "mention", memberId });
    cursor = atIndex + 1 + handle.length;
    pushText(trailing);
    cursor += trailing.length;
  }
  pushText(text.slice(cursor));
  return parts;
}

/** Plain text of a message, mentions written `@Name`, for quotes, previews and search. */
export function plainText(parts: readonly MessagePart[], nameOf: (memberId: string) => string): string {
  return parts.map((part) => (part.type === "text" ? part.text : `@${nameOf(part.memberId)}`)).join("");
}

export function mentionsMember(message: ChatMessage, memberId: string = CHAT_VIEWER_ID): boolean {
  return message.parts.some((part) => part.type === "mention" && part.memberId === memberId);
}

/** Members mentioned in a list of messages, most recent mention first, without repeats. */
export function mentionedMembers(messages: readonly ChatMessage[]): string[] {
  const seen: string[] = [];
  for (const message of [...messages].sort((a, b) => a.minutesAgo - b.minutesAgo)) {
    for (const part of message.parts) {
      if (part.type === "mention" && !seen.includes(part.memberId)) seen.push(part.memberId);
    }
  }
  return seen;
}

/** Authors of a list of messages, most recent first, without repeats. */
export function recentAuthors(messages: readonly ChatMessage[]): string[] {
  const seen: string[] = [];
  for (const message of [...messages].sort((a, b) => a.minutesAgo - b.minutesAgo)) {
    if (!seen.includes(message.authorId)) seen.push(message.authorId);
  }
  return seen;
}

/* --------------------------------------------------------------- timeline */

/** Gap under which two messages of one author read as one block. */
export const GROUP_WINDOW_MINUTES = 7;

/** When a message was written, in epoch milliseconds, seen from `now`. */
export function timestampOf(message: ChatMessage, now: number): number {
  return message.sentAt ?? now - message.minutesAgo * 60_000;
}

/** Calendar day of a timestamp, as a stable key (`YYYY-MM-DD`). */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Whether `current` continues `previous` without repeating the author's name:
 * same author, same day, a few minutes apart, and not a reply (a reply always
 * shows who answers whom).
 */
export function continuesPrevious(previous: ChatMessage | undefined, current: ChatMessage, now: number): boolean {
  if (!previous || current.replyToId) return false;
  if (previous.authorId !== current.authorId) return false;
  const before = timestampOf(previous, now);
  const after = timestampOf(current, now);
  if (dayKey(before) !== dayKey(after)) return false;
  return after - before <= GROUP_WINDOW_MINUTES * 60_000;
}

/** Oldest first: a conversation reads top to bottom. */
export function chronological(messages: readonly ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => b.minutesAgo - a.minutesAgo);
}

/** Messages of the last 24 hours. */
export function messagesToday(messages: readonly ChatMessage[]): number {
  return messages.filter((message) => message.minutesAgo < 24 * 60).length;
}

/* ----------------------------------------------------------------- search */

export interface SearchableRoom {
  room: ChatRoom;
  /** How the room is named in results ("# Techniques & Tips", "Emma Martin"). */
  label: string;
  messages: readonly ChatMessage[];
}

export interface SearchableChannel {
  channelId: string;
  name: string;
  topic: string;
}

export interface SearchResults<C extends SearchableChannel> {
  messages: Array<{ room: ChatRoom; label: string; message: ChatMessage; text: string }>;
  members: ChatMember[];
  channels: C[];
}

/**
 * Messages, members and channels matching every word of the query, accents
 * and case ignored. Messages are newest first; each group is capped so the
 * overlay stays readable.
 */
export function searchCommunity<C extends SearchableChannel>(
  query: string,
  scope: { rooms: readonly SearchableRoom[]; members: readonly ChatMember[]; channels: readonly C[] },
  nameOf: (memberId: string) => string,
  limits = { messages: 8, members: 5, channels: 5 },
): SearchResults<C> {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return { messages: [], members: [], channels: [] };
  const matches = (value: string) => {
    const haystack = normalize(value);
    return words.every((word) => haystack.includes(word));
  };

  const messages = scope.rooms
    .flatMap(({ room, label, messages: list }) =>
      list.map((message) => ({ room, label, message, text: plainText(message.parts, nameOf) })),
    )
    .filter(({ text, message }) => matches(`${text} ${nameOf(message.authorId)}`))
    .sort((a, b) => a.message.minutesAgo - b.message.minutesAgo)
    .slice(0, limits.messages);

  const members = scope.members
    .filter((member) => matches(`${member.name} ${member.handle} ${member.city}`))
    .slice(0, limits.members);

  const channels = scope.channels.filter((channel) => matches(`${channel.name} ${channel.topic}`)).slice(0, limits.channels);

  return { messages, members, channels };
}
