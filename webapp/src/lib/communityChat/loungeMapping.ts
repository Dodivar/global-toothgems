import type { Database, Json } from "../supabase/database.types";
import {
  CHAT_REACTIONS,
  isServerId,
  type AvatarTone,
  type ChatMember,
  type ChatMessage,
  type ChatReaction,
  type ChatRole,
  type MessagePart,
  type Presence,
  type ServerId,
} from "./model";

/*
 * Rows of the Members' Lounge (Supabase) ↔ the shapes the screens use.
 * Pure functions: everything coming from the database is treated as untrusted
 * input and narrowed, never cast.
 */

export type DirectoryRow = Database["public"]["Functions"]["lounge_directory"]["Returns"][number];

/** The columns of `lounge_messages` the lounge reads, with their attachments. */
export const LOUNGE_MESSAGE_SELECT =
  "id, channel_id, conversation_id, author_id, parts, reply_to_id, reactions, created_at, lounge_message_attachments(storage_path, alt_text, position)";

export interface MessageRow {
  id: string;
  channel_id: string | null;
  conversation_id: string | null;
  author_id: string;
  parts: Json;
  reply_to_id: string | null;
  reactions: Json;
  created_at: string;
  lounge_message_attachments?: Array<{ storage_path: string; alt_text: string; position: number }> | null;
}

const TONES: AvatarTone[] = ["blue", "emerald", "fuchsia", "ink"];
const PRESENCES: Presence[] = ["online", "away", "offline"];
const ROLES: ChatRole[] = ["team", "mentor", "new"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A stable avatar tint per member, so a member keeps their colour everywhere. */
export function toneFor(id: string): AvatarTone {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return TONES[hash % TONES.length];
}

/** Message parts from the database; anything that is not a text or a mention is dropped. */
export function mapParts(value: Json | undefined): MessagePart[] {
  if (!Array.isArray(value)) return [];
  const parts: MessagePart[] = [];
  for (const part of value) {
    if (!isRecord(part)) continue;
    if (part.type === "text" && typeof part.text === "string") parts.push({ type: "text", text: part.text });
    else if (part.type === "mention" && typeof part.memberId === "string") parts.push({ type: "mention", memberId: part.memberId });
  }
  return parts;
}

/** Reaction totals, known reactions with a positive whole count only. */
export function mapReactions(value: Json | undefined): Partial<Record<ChatReaction, number>> | undefined {
  if (!isRecord(value)) return undefined;
  const totals: Partial<Record<ChatReaction, number>> = {};
  let any = false;
  for (const reaction of CHAT_REACTIONS) {
    const count = value[reaction];
    if (typeof count === "number" && Number.isInteger(count) && count > 0) {
      totals[reaction] = count;
      any = true;
    }
  }
  return any ? totals : undefined;
}

/** A lounge message as the screens show it. `signed` turns a storage path into a viewable URL. */
export function mapMessage(row: MessageRow, mine: readonly ChatReaction[], signed: (path: string) => string | undefined): ChatMessage {
  const attachments = [...(row.lounge_message_attachments ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((attachment) => {
      const src = signed(attachment.storage_path);
      return src ? { kind: "image" as const, src, name: attachment.storage_path.split("/").pop() ?? "", alt: attachment.alt_text } : null;
    })
    .filter((attachment) => attachment !== null);
  return {
    id: row.id,
    authorId: row.author_id,
    minutesAgo: 0,
    sentAt: Date.parse(row.created_at),
    parts: mapParts(row.parts),
    replyToId: row.reply_to_id ?? undefined,
    reactions: mapReactions(row.reactions),
    mine: mine.length ? [...mine] : undefined,
    attachments: attachments.length ? attachments : undefined,
  };
}

/** A lounge member as other members see them. `fallbackName` stands in for a member with no name. */
export function mapMember(row: DirectoryRow, fallbackName: string): ChatMember {
  const languages = (row.languages ?? []).filter((code): code is ServerId => isServerId(code));
  return {
    id: row.user_id,
    name: row.display_name?.trim() || fallbackName,
    handle: row.handle,
    country: row.country_code ? row.country_code.trim().toUpperCase() : undefined,
    languages,
    presence: PRESENCES.includes(row.presence as Presence) ? (row.presence as Presence) : "offline",
    role: ROLES.includes(row.role as ChatRole) ? (row.role as ChatRole) : undefined,
    trainings: [...(row.trainings ?? [])],
    joined: (row.joined_at ?? "").slice(0, 7),
    messageCount: Number(row.message_count) || 0,
    tone: toneFor(row.user_id),
  };
}

export interface OverviewChannel {
  id: string;
  unread: number;
  mentions: number;
  muted: boolean;
}

export interface OverviewConversation {
  /** The conversation's database id. */
  id: string;
  memberId: string;
  unread: number;
  muted: boolean;
  last?: MessageRow & { attachmentCount: number };
}

export interface Overview {
  channels: OverviewChannel[];
  conversations: OverviewConversation[];
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** `lounge_overview()`: unread counts per channel, the member's private conversations. */
export function mapOverview(value: Json | null): Overview {
  const overview: Overview = { channels: [], conversations: [] };
  if (!isRecord(value)) return overview;
  for (const channel of Array.isArray(value.channels) ? value.channels : []) {
    if (!isRecord(channel) || typeof channel.id !== "string") continue;
    overview.channels.push({ id: channel.id, unread: count(channel.unread), mentions: count(channel.mentions), muted: channel.muted === true });
  }
  for (const conversation of Array.isArray(value.conversations) ? value.conversations : []) {
    if (!isRecord(conversation) || typeof conversation.id !== "string" || typeof conversation.member_id !== "string") continue;
    const last = conversation.last;
    overview.conversations.push({
      id: conversation.id,
      memberId: conversation.member_id,
      unread: count(conversation.unread),
      muted: conversation.muted === true,
      last:
        isRecord(last) && typeof last.id === "string" && typeof last.author_id === "string" && typeof last.created_at === "string"
          ? {
              id: last.id,
              channel_id: null,
              conversation_id: conversation.id,
              author_id: last.author_id,
              parts: (last.parts ?? []) as Json,
              reply_to_id: typeof last.reply_to_id === "string" ? last.reply_to_id : null,
              reactions: (last.reactions ?? {}) as Json,
              created_at: last.created_at,
              attachmentCount: count(last.attachments),
            }
          : undefined,
    });
  }
  return overview;
}

export type NotificationKindRow = "mention" | "reply" | "reaction";

export interface NotificationRow {
  id: string;
  kind: string;
  actor_id: string | null;
  created_at: string;
  read_at: string | null;
  message: MessageRow | null;
}

export const LOUNGE_NOTIFICATION_SELECT = `id, kind, actor_id, created_at, read_at, message:lounge_messages(${LOUNGE_MESSAGE_SELECT})`;

export function isNotificationKind(kind: string): kind is NotificationKindRow {
  return kind === "mention" || kind === "reply" || kind === "reaction";
}

/** Total reactions on a message, the viewer's own taken out. */
export function reactionsByOthers(message: ChatMessage): number {
  const total = Object.values(message.reactions ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
  return Math.max(0, total - (message.mine?.length ?? 0));
}

/** Where an image picked in the composer is stored: the member's own folder, a random name. */
export function attachmentPath(userId: string, file: { name: string; type: string }, id: string): string {
  const fromType = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.type];
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(file.name)?.[1]?.toLowerCase();
  return `${userId}/${id}.${fromType ?? fromName ?? "jpg"}`;
}

export type LoungeFailure = "rateLimited" | "forbidden" | "failed";

/** What a failed lounge call means for the member. */
export function loungeFailure(error: { code?: string | null; message?: string | null } | null | undefined): LoungeFailure {
  if (!error) return "failed";
  if (error.code === "PT429") return "rateLimited";
  if (error.code === "42501") return "forbidden";
  return "failed";
}
