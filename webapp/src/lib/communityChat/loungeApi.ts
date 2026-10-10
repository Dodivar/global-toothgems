import type { RealtimeChannel } from "@supabase/supabase-js";
import { requireSupabase } from "../supabase/client";
import { BUCKETS, signedUrls } from "../supabase/storage";
import type { ChatReaction, MessagePart, Presence, ServerId } from "./model";
import {
  LOUNGE_MESSAGE_SELECT,
  LOUNGE_NOTIFICATION_SELECT,
  attachmentPath,
  loungeFailure,
  mapOverview,
  type DirectoryRow,
  type LoungeFailure,
  type MessageRow,
  type NotificationRow,
  type Overview,
} from "./loungeMapping";

/*
 * The Members' Lounge's only door to Supabase. Every rule lives in the
 * database (migration `members_lounge`): who may enter, which rooms can be
 * read, what a message may contain. These calls ask; the database decides.
 */

/** Messages read per room. */
export const ROOM_PAGE_SIZE = 100;

export class LoungeError extends Error {
  readonly reason: LoungeFailure;
  constructor(reason: LoungeFailure) {
    super(`lounge: ${reason}`);
    this.reason = reason;
  }
}

function fail(error: { code?: string | null; message?: string | null } | null): never {
  throw new LoungeError(loungeFailure(error));
}

/*
 * The generated types mark every function argument as required and non-null;
 * the lounge functions take `null` for "no channel" / "no recipient".
 */
function nullable<T>(value: T | null): T {
  return value as T;
}

export async function canEnterLounge(): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("lounge_access");
  if (error) fail(error);
  return data === true;
}

/** Enters the lounge (creates the member on first entry), optionally adding a lounge to theirs. */
export async function joinLounge(lounge?: ServerId): Promise<void> {
  const { error } = await requireSupabase().rpc("lounge_join", lounge ? { p_lounge: lounge } : {});
  if (error) fail(error);
}

export async function heartbeat(presence?: Presence): Promise<void> {
  const { error } = await requireSupabase().rpc("lounge_heartbeat", presence ? { p_presence: presence } : {});
  if (error) fail(error);
}

export async function fetchDirectory(): Promise<DirectoryRow[]> {
  const { data, error } = await requireSupabase().rpc("lounge_directory");
  if (error) fail(error);
  return data ?? [];
}

export async function fetchOverview(): Promise<Overview> {
  const { data, error } = await requireSupabase().rpc("lounge_overview");
  if (error) fail(error);
  return mapOverview(data);
}

/** The member's own lounge row: their chosen presence. */
export async function fetchOwnPresence(userId: string): Promise<Presence | null> {
  const { data, error } = await requireSupabase().from("lounge_members").select("presence").eq("user_id", userId).maybeSingle();
  if (error) fail(error);
  const presence = data?.presence;
  return presence === "online" || presence === "away" || presence === "offline" ? presence : null;
}

/** The latest messages of a room, oldest first. */
export async function fetchRoomMessages(room: { channelId: string } | { conversationId: string }): Promise<MessageRow[]> {
  let query = requireSupabase().from("lounge_messages").select(LOUNGE_MESSAGE_SELECT);
  query = "channelId" in room ? query.eq("channel_id", room.channelId) : query.eq("conversation_id", room.conversationId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(ROOM_PAGE_SIZE);
  if (error) fail(error);
  return ((data ?? []) as unknown as MessageRow[]).reverse();
}

export async function fetchMessage(id: string): Promise<MessageRow | null> {
  const { data, error } = await requireSupabase().from("lounge_messages").select(LOUNGE_MESSAGE_SELECT).eq("id", id).maybeSingle();
  if (error) fail(error);
  return (data as unknown as MessageRow | null) ?? null;
}

/** The member's own reactions on some messages. */
export async function fetchMyReactions(userId: string, messageIds: string[]): Promise<Map<string, ChatReaction[]>> {
  const mine = new Map<string, ChatReaction[]>();
  if (messageIds.length === 0) return mine;
  const { data, error } = await requireSupabase()
    .from("lounge_reactions")
    .select("message_id, reaction")
    .eq("user_id", userId)
    .in("message_id", messageIds);
  if (error) fail(error);
  for (const row of data ?? []) {
    const list = mine.get(row.message_id) ?? [];
    list.push(row.reaction as ChatReaction);
    mine.set(row.message_id, list);
  }
  return mine;
}

export async function fetchNotifications(userId: string): Promise<NotificationRow[]> {
  const { data, error } = await requireSupabase()
    .from("lounge_notifications")
    .select(LOUNGE_NOTIFICATION_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) fail(error);
  return (data ?? []) as unknown as NotificationRow[];
}

/** Viewable URLs of message images (private bucket, signed for an hour). */
export async function signAttachments(rows: MessageRow[]): Promise<Map<string, string>> {
  const paths = rows.flatMap((row) => (row.lounge_message_attachments ?? []).map((attachment) => attachment.storage_path));
  return paths.length ? signedUrls(BUCKETS.loungeMedia, [...new Set(paths)]) : new Map();
}

/** Uploads the picked images into the member's folder; returns their paths. */
export async function uploadImages(userId: string, files: Array<{ file: File; alt: string }>): Promise<Array<{ path: string; alt: string }>> {
  const storage = requireSupabase().storage.from(BUCKETS.loungeMedia);
  const uploaded: Array<{ path: string; alt: string }> = [];
  for (const { file, alt } of files) {
    const path = attachmentPath(userId, file, crypto.randomUUID());
    const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      if (uploaded.length) await storage.remove(uploaded.map((item) => item.path));
      throw new LoungeError("failed");
    }
    uploaded.push({ path, alt });
  }
  return uploaded;
}

export async function postMessage(input: {
  channelId: string | null;
  recipientId: string | null;
  parts: MessagePart[];
  replyToId?: string;
  attachments: Array<{ path: string; alt: string }>;
}): Promise<string> {
  const { data, error } = await requireSupabase().rpc("lounge_post_message", {
    p_channel_id: nullable(input.channelId),
    p_recipient_id: nullable(input.recipientId),
    p_parts: input.parts,
    p_reply_to_id: input.replyToId,
    p_attachments: input.attachments,
  });
  if (error || !data) fail(error);
  return data;
}

/** Removes images uploaded for a message that was then refused. */
export async function removeImages(paths: string[]): Promise<void> {
  if (paths.length) await requireSupabase().storage.from(BUCKETS.loungeMedia).remove(paths);
}

export async function toggleReaction(messageId: string, reaction: ChatReaction): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc("lounge_toggle_reaction", { p_message_id: messageId, p_reaction: reaction });
  if (error) fail(error);
  return data === true;
}

export async function markRead(channelIds: string[], conversationIds: string[]): Promise<void> {
  if (channelIds.length === 0 && conversationIds.length === 0) return;
  const { error } = await requireSupabase().rpc("lounge_mark_read", { p_channel_ids: channelIds, p_conversation_ids: conversationIds });
  if (error) fail(error);
}

export async function setMuted(room: { channelId: string } | { conversationId: string }, muted: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc("lounge_set_muted", {
    p_channel_id: nullable("channelId" in room ? room.channelId : null),
    p_conversation_id: nullable("conversationId" in room ? room.conversationId : null),
    p_muted: muted,
  });
  if (error) fail(error);
}

export async function readNotifications(ids: string[] | null): Promise<void> {
  const { error } = await requireSupabase().rpc("lounge_read_notifications", ids ? { p_ids: ids } : {});
  if (error) fail(error);
}

/**
 * New and changed messages (reaction totals) and the member's notifications,
 * as they happen. Realtime checks each event against the same RLS as a read,
 * so only rooms the member can read come through.
 */
export function subscribe(
  userId: string,
  handlers: { message: (row: MessageRow, kind: "insert" | "update") => void; notification: () => void; status: (ok: boolean) => void },
): () => void {
  const db = requireSupabase();
  const channel: RealtimeChannel = db
    .channel(`lounge:${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "lounge_messages" }, (payload) =>
      handlers.message(payload.new as MessageRow, "insert"),
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lounge_messages" }, (payload) =>
      handlers.message(payload.new as MessageRow, "update"),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "lounge_notifications", filter: `user_id=eq.${userId}` }, () =>
      handlers.notification(),
    )
    .subscribe((status) => handlers.status(status === "SUBSCRIBED"));
  return () => {
    void db.removeChannel(channel);
  };
}
