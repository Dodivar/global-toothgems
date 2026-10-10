"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth";
import { useCommunity } from "../community";
import { useNavigate } from "../navigation";
import {
  CHANNEL_KEYS,
  DEFAULT_SERVER,
  LOUNGES,
  catalogChannel,
  channelId as channelIdOf,
  directConversationId,
  memberOfConversation,
  parseChannelId,
  type ChatAttachment,
  type ChatMember,
  type ChatMessage,
  type ChatReaction,
  type ChatServer,
  type MessagePart,
  type Presence,
  type ServerId,
} from "./model";
import { roomKey as keyOf, toggleReaction as toggleIn, type ChatRoom } from "./chatLogic";
import { loungePath } from "./loungeRoutes";
import {
  isNotificationKind,
  mapMember,
  mapMessage,
  reactionsByOthers,
  type DirectoryRow,
  type MessageRow,
  type NotificationRow,
  type Overview,
} from "./loungeMapping";
import * as api from "./loungeApi";
import {
  ChatContext,
  type ChannelView,
  type ChatContextValue,
  type ChatNotification,
  type ConversationView,
  type LoadStatus,
  type SendResult,
} from "./chatContext";

/**
 * The Members' Lounge on Supabase.
 *
 * Mounted with the member space (`zones/account.tsx`), so the sidebar can show
 * what is waiting; it reads nothing until the member may enter
 * (`useCommunity().hasAccess`, itself asked of the database). Then:
 *  - on entry: the member row (`lounge_join`), the directory, the overview
 *    (unread counts, private conversations) and the inbox;
 *  - per room, when it is opened: its latest messages, the member's own
 *    reactions on them, signed URLs for their images;
 *  - Realtime: new messages and reaction totals (`lounge_messages`, checked by
 *    RLS like a read), the member's notifications;
 *  - every minute while the space is open: a heartbeat (presence) and the
 *    directory again, so other members' presence follows.
 * Every write is a `lounge_*` function: the database checks access, room,
 * content, mentions and rate.
 */

const HEARTBEAT_MS = 60_000;
/** Signed image URLs last an hour: a room read longer ago than this is read again when reopened. */
const ROOM_FRESH_MS = 45 * 60_000;

interface RoomCache {
  status: LoadStatus;
  messages: ChatMessage[];
  loadedAt: number;
}

interface LiveData {
  owner: string;
  members: Record<string, ChatMember>;
  active: Record<string, boolean>;
  overview: Overview;
  notifications: NotificationRow[];
}

function channelRoom(channelId: string): ChatRoom {
  return { kind: "channel", channelId };
}

function dmRoom(memberId: string): ChatRoom {
  return { kind: "dm", conversationId: directConversationId(memberId) };
}

/** The room of a message row, as the screens name it (null: a conversation not known yet). */
function roomOf(row: Pick<MessageRow, "channel_id" | "conversation_id">, overview: Overview | undefined): ChatRoom | null {
  if (row.channel_id) return channelRoom(row.channel_id);
  const conversation = overview?.conversations.find((c) => c.id === row.conversation_id);
  return conversation ? dmRoom(conversation.memberId) : null;
}

let pendingIds = 0;
let focusNonce = 0;

export function LiveChatProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { userId, displayName } = useAuth();
  const { hasAccess } = useCommunity();
  const navigate = useNavigate();
  const fallbackName = t("lounge.memberUnnamed");

  /* ------------------------------------------------------------ data state */
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<LiveData | null>(null);
  const [rooms, setRooms] = useState<Record<string, RoomCache>>({});
  const [mine, setMine] = useState<Record<string, ChatReaction[]>>({});
  const [presence, setPresenceState] = useState<Presence>("online");
  const [attempt, setAttempt] = useState(0);

  /* -------------------------------------------------------------- UI state */
  const [serverId, setServerId] = useState<ServerId>(DEFAULT_SERVER);
  const [room, setRoom] = useState<ChatRoom>(channelRoom(channelIdOf(DEFAULT_SERVER, "general")));
  const [active, setActive] = useState(false);
  const [lastChannel, setLastChannel] = useState<Record<ServerId, string>>(
    () => Object.fromEntries(LOUNGES.map((l) => [l.id, channelIdOf(l.id, "general")])) as Record<ServerId, string>,
  );
  const [divider, setDivider] = useState<{ key: string; count: number } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, string | undefined>>({});
  const [focus, setFocus] = useState<{ messageId: string; nonce: number } | null>(null);
  const [composerFocus, setComposerFocus] = useState(0);
  const pendingFocus = useRef<string | undefined>(undefined);

  const enabled = Boolean(userId && hasAccess);
  const current = enabled && data?.owner === userId ? data : null;
  const key = keyOf(room);

  /* Latest values for callbacks fired by Realtime and timers. */
  const latest = useRef({ current, rooms, room, active, userId, mine });
  useEffect(() => {
    latest.current = { current, rooms, room, active, userId, mine };
  });

  /* ------------------------------------------------------------- reading */

  const toMembers = useCallback(
    (rows: DirectoryRow[]) => {
      const members: Record<string, ChatMember> = {};
      const activeIds: Record<string, boolean> = {};
      for (const row of rows) {
        members[row.user_id] = mapMember(row, fallbackName);
        activeIds[row.user_id] = row.active;
      }
      return { members, active: activeIds };
    },
    [fallbackName],
  );

  const refreshOverview = useCallback(async () => {
    const owner = latest.current.userId;
    if (!owner) return;
    try {
      const overview = await api.fetchOverview();
      setData((previous) => (previous && previous.owner === owner ? { ...previous, overview } : previous));
    } catch {
      /* Counts stay as they were; the next event or heartbeat reads them again. */
    }
  }, []);

  const refreshDirectory = useCallback(async () => {
    const owner = latest.current.userId;
    if (!owner) return;
    try {
      const next = toMembers(await api.fetchDirectory());
      setData((previous) => (previous && previous.owner === owner ? { ...previous, ...next } : previous));
    } catch {
      /* Presence stays as it was until the next heartbeat. */
    }
  }, [toMembers]);

  const refreshNotifications = useCallback(async () => {
    const owner = latest.current.userId;
    if (!owner) return;
    try {
      const notifications = await api.fetchNotifications(owner);
      setData((previous) => (previous && previous.owner === owner ? { ...previous, notifications } : previous));
    } catch {
      /* The inbox stays as it was. */
    }
  }, []);

  /* Entering: the member row, then everything the sidebar and the inbox need. */
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        await api.joinLounge();
        const [directory, overview, notifications, ownPresence] = await Promise.all([
          api.fetchDirectory(),
          api.fetchOverview(),
          api.fetchNotifications(userId),
          api.fetchOwnPresence(userId),
        ]);
        if (cancelled) return;
        setData({ owner: userId, ...toMembers(directory), overview, notifications });
        if (ownPresence) setPresenceState(ownPresence);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("[lounge] entry failed", error instanceof api.LoungeError ? error.reason : error);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, attempt, toMembers]);

  /* Another account: nothing of the previous one stays. */
  useEffect(() => {
    setRooms({});
    setMine({});
    setDrafts({});
    setReplyTo({});
    setDivider(null);
  }, [userId]);

  /** The database id of the private conversation with a member, once there is one. */
  const conversationIdWith = useCallback(
    (memberId: string, source: LiveData | null = latest.current.current) =>
      source?.overview.conversations.find((c) => c.memberId === memberId)?.id,
    [],
  );

  const roomOfRow = useCallback(
    (row: Pick<MessageRow, "channel_id" | "conversation_id">) => roomOf(row, latest.current.current?.overview),
    [],
  );

  const mapRows = useCallback(async (rows: MessageRow[]): Promise<ChatMessage[]> => {
    const owner = latest.current.userId;
    if (!owner) return [];
    const [urls, reactions] = await Promise.all([api.signAttachments(rows), api.fetchMyReactions(owner, rows.map((row) => row.id))]);
    setMine((previous) => {
      const next = { ...previous };
      for (const row of rows) next[row.id] = reactions.get(row.id) ?? [];
      return next;
    });
    return rows.map((row) => mapMessage(row, reactions.get(row.id) ?? [], (path) => urls.get(path)));
  }, []);

  const loadRoom = useCallback(
    async (target: ChatRoom) => {
      const roomKey = keyOf(target);
      let source: { channelId: string } | { conversationId: string } | null;
      if (target.kind === "channel") source = { channelId: target.channelId };
      else {
        const conversationId = conversationIdWith(memberOfConversation(target.conversationId));
        source = conversationId ? { conversationId } : null;
      }
      if (!source) {
        /* A conversation not started yet: nothing to read. */
        setRooms((previous) => ({ ...previous, [roomKey]: { status: "ready", messages: [], loadedAt: Date.now() } }));
        return;
      }
      setRooms((previous) => ({
        ...previous,
        [roomKey]: { status: "loading", messages: previous[roomKey]?.messages ?? [], loadedAt: previous[roomKey]?.loadedAt ?? 0 },
      }));
      try {
        const messages = await mapRows(await api.fetchRoomMessages(source));
        setRooms((previous) => ({ ...previous, [roomKey]: { status: "ready", messages, loadedAt: Date.now() } }));
      } catch (error) {
        console.error("[lounge] room failed", error instanceof api.LoungeError ? error.reason : error);
        setRooms((previous) => ({
          ...previous,
          [roomKey]: { status: "error", messages: previous[roomKey]?.messages ?? [], loadedAt: previous[roomKey]?.loadedAt ?? 0 },
        }));
      }
    },
    [conversationIdWith, mapRows],
  );

  /** Puts a message in its room (replacing it, or the pending copy it confirms). */
  const upsertMessage = useCallback((roomKey: string, message: ChatMessage, replaces?: string) => {
    setRooms((previous) => {
      const cache = previous[roomKey];
      if (!cache) return previous;
      const list = cache.messages.filter((m) => m.id !== message.id && m.id !== replaces);
      list.push(message);
      list.sort((a, b) => (a.sentAt ?? 0) - (b.sentAt ?? 0));
      return { ...previous, [roomKey]: { ...cache, messages: list } };
    });
  }, []);

  /* ----------------------------------------------------------- read state */

  const markRoomsRead = useCallback(
    (targets: ChatRoom[]) => {
      const source = latest.current.current;
      if (!source) return;
      const channelIds = targets.flatMap((r) => (r.kind === "channel" ? [r.channelId] : []));
      const conversationIds = targets.flatMap((r) => {
        if (r.kind !== "dm") return [];
        const id = conversationIdWith(memberOfConversation(r.conversationId), source);
        return id ? [id] : [];
      });
      if (channelIds.length === 0 && conversationIds.length === 0) return;
      setData((previous) =>
        previous
          ? {
              ...previous,
              overview: {
                channels: previous.overview.channels.map((c) => (channelIds.includes(c.id) ? { ...c, unread: 0, mentions: 0 } : c)),
                conversations: previous.overview.conversations.map((c) => (conversationIds.includes(c.id) ? { ...c, unread: 0 } : c)),
              },
            }
          : previous,
      );
      api
        .markRead(channelIds, conversationIds)
        .then(() => (channelIds.length ? refreshNotifications() : undefined))
        .catch(() => refreshOverview());
    },
    [conversationIdWith, refreshNotifications, refreshOverview],
  );

  /* -------------------------------------------------------------- Realtime */

  const overviewTimer = useRef<number | undefined>(undefined);
  const scheduleOverview = useCallback(() => {
    window.clearTimeout(overviewTimer.current);
    overviewTimer.current = window.setTimeout(() => void refreshOverview(), 400);
  }, [refreshOverview]);

  const notificationTimer = useRef<number | undefined>(undefined);
  const scheduleNotifications = useCallback(() => {
    window.clearTimeout(notificationTimer.current);
    notificationTimer.current = window.setTimeout(() => void refreshNotifications(), 400);
  }, [refreshNotifications]);

  const readTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (status !== "ready" || !userId || !enabled) return;
    const unsubscribe = api.subscribe(userId, {
      message: (row, kind) => {
        const { rooms: cache, room: onScreen, active: visible, current: source } = latest.current;
        if (!row?.id) return;
        if (source && !source.members[row.author_id]) void refreshDirectory();
        const target = roomOfRow(row);
        if (!target) {
          /* A conversation this page does not know yet: someone wrote first. */
          scheduleOverview();
          return;
        }
        const roomKey = keyOf(target);
        if (kind === "update") {
          const existing = cache[roomKey]?.messages.find((m) => m.id === row.id);
          if (existing) {
            const mineNow = latest.current.mine[row.id] ?? [];
            upsertMessage(roomKey, { ...mapMessage({ ...row, lounge_message_attachments: [] }, mineNow, () => undefined), attachments: existing.attachments });
          }
          return;
        }
        if (cache[roomKey]) {
          void api
            .fetchMessage(row.id)
            .then((full) => (full ? mapRows([full]) : []))
            .then(([message]) => message && upsertMessage(roomKey, message))
            .catch(() => undefined);
        }
        if (row.author_id === userId) return;
        if (visible && keyOf(onScreen) === roomKey && document.visibilityState === "visible") {
          window.clearTimeout(readTimer.current);
          readTimer.current = window.setTimeout(() => markRoomsRead([target]), 600);
        } else {
          scheduleOverview();
        }
      },
      notification: scheduleNotifications,
      status: (ok) => {
        /* Back after a disconnection: catch up on what was missed. */
        if (ok) scheduleOverview();
      },
    });
    return () => {
      unsubscribe();
      window.clearTimeout(overviewTimer.current);
      window.clearTimeout(notificationTimer.current);
      window.clearTimeout(readTimer.current);
    };
  }, [status, userId, enabled, roomOfRow, upsertMessage, mapRows, markRoomsRead, scheduleOverview, scheduleNotifications, refreshDirectory]);

  /* Presence: a heartbeat every minute while the member space is open, and the others' presence with it. */
  useEffect(() => {
    if (status !== "ready" || !enabled) return;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void api.heartbeat().catch(() => undefined);
      void refreshDirectory();
    };
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [status, enabled, refreshDirectory]);

  /* ------------------------------------------------------------- derived */

  const memberOf = useCallback((id: string) => current?.members[id], [current]);
  const nameOf = useCallback((id: string) => current?.members[id]?.name ?? "—", [current]);

  const viewer = useMemo<ChatMember>(() => {
    const own = userId ? current?.members[userId] : undefined;
    return own
      ? { ...own, presence }
      : {
          id: userId ?? "",
          name: displayName || fallbackName,
          handle: "",
          languages: [serverId],
          presence,
          trainings: [],
          joined: "",
          messageCount: 0,
          tone: "blue",
        };
  }, [userId, current, presence, displayName, fallbackName, serverId]);

  const activeMembers = useMemo(
    () => Object.values(current?.members ?? {}).filter((m) => current?.active[m.id] && m.id !== userId),
    [current, userId],
  );

  const servers = useMemo<ChatServer[]>(
    () =>
      LOUNGES.map((lounge) => {
        const memberIds = [...activeMembers.filter((m) => m.languages.includes(lounge.id)).map((m) => m.id)];
        const viewerIn = viewer.languages.includes(lounge.id);
        return {
          id: lounge.id,
          name: lounge.name,
          memberCount: memberIds.length + (viewerIn ? 1 : 0),
          memberIds,
          channels: CHANNEL_KEYS.map((channelKey) => catalogChannel(lounge.id, channelKey)),
        };
      }),
    [activeMembers, viewer.languages],
  );

  const server = servers.find((s) => s.id === serverId) ?? servers[0];

  const messagesOf = useCallback((target: ChatRoom) => rooms[keyOf(target)]?.messages ?? [], [rooms]);

  const channelsOf = useCallback(
    (id: ServerId): ChannelView[] => {
      const lounge = servers.find((s) => s.id === id) ?? servers[0];
      return lounge.channels.map((channel) => {
        const counts = current?.overview.channels.find((c) => c.id === channel.id);
        return {
          ...channel,
          serverId: lounge.id,
          unread: counts?.unread ?? 0,
          mentions: counts?.mentions ?? 0,
          muted: counts?.muted ?? false,
        };
      });
    },
    [servers, current],
  );

  const channels = useMemo(() => channelsOf(server.id), [channelsOf, server.id]);

  const serverUnread = useCallback(
    (id: ServerId) =>
      channelsOf(id).reduce(
        (sum, channel) => ({ unread: sum.unread + (channel.muted ? 0 : channel.unread), mentions: sum.mentions + channel.mentions }),
        { unread: 0, mentions: 0 },
      ),
    [channelsOf],
  );

  const conversations = useMemo<ConversationView[]>(() => {
    if (!current) return [];
    const views: ConversationView[] = [];
    for (const conversation of current.overview.conversations) {
      const member = current.members[conversation.memberId];
      if (!member) continue;
      const cached = rooms[keyOf(dmRoom(member.id))]?.messages;
      const last =
        cached && cached.length
          ? cached[cached.length - 1]
          : conversation.last
            ? {
                ...mapMessage({ ...conversation.last, lounge_message_attachments: [] }, [], () => undefined),
                /* The preview says "📷" for an image the list does not sign. */
                attachments: conversation.last.attachmentCount ? [{ kind: "image" as const, src: "", name: "", alt: "" }] : undefined,
              }
            : undefined;
      views.push({
        conversation: { id: directConversationId(member.id), memberId: member.id, unread: conversation.unread, messages: [] },
        member,
        last,
        unread: conversation.unread,
      });
    }
    /* A conversation opened by its address, before its first message. */
    if (room.kind === "dm") {
      const memberId = memberOfConversation(room.conversationId);
      const member = current.members[memberId];
      if (member && memberId !== userId && current.active[memberId] && !views.some((v) => v.member.id === memberId)) {
        views.unshift({ conversation: { id: room.conversationId, memberId, unread: 0, messages: [] }, member, unread: 0 });
      }
    }
    return views.sort((a, b) => (b.last?.sentAt ?? Number.MAX_SAFE_INTEGER) - (a.last?.sentAt ?? Number.MAX_SAFE_INTEGER));
  }, [current, rooms, room, userId]);

  const dmUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  const currentChannel = room.kind === "channel" ? channels.find((c) => c.id === room.channelId) : undefined;
  const currentConversation = room.kind === "dm" ? conversations.find((c) => c.conversation.id === room.conversationId) : undefined;
  const messages = useMemo(() => messagesOf(room), [messagesOf, room]);
  const roomStatus: LoadStatus = rooms[key]?.status ?? "loading";

  const reactionsMine = useCallback((message: ChatMessage) => mine[message.id] ?? message.mine ?? [], [mine]);

  const notifications = useMemo<ChatNotification[]>(() => {
    if (!current) return [];
    const list: ChatNotification[] = [];
    for (const row of current.notifications) {
      if (!row.message || !isNotificationKind(row.kind)) continue;
      const target = roomOf(row.message, current.overview);
      if (!target) continue;
      const message = mapMessage(row.message, mine[row.message.id] ?? [], () => undefined);
      list.push({
        id: row.id,
        kind: row.kind,
        room: target,
        serverId: row.message.channel_id ? parseChannelId(row.message.channel_id)?.server : undefined,
        actorId: row.kind === "reaction" ? "" : (row.actor_id ?? ""),
        message: { ...message, sentAt: Date.parse(row.created_at) },
        reactionCount: row.kind === "reaction" ? reactionsByOthers(message) : undefined,
        unread: row.read_at === null,
      });
    }
    for (const view of conversations) {
      if (view.unread > 0 && view.last) {
        list.push({ id: `dm:${view.last.id}`, kind: "dm", room: dmRoom(view.member.id), actorId: view.member.id, message: view.last, unread: true });
      }
    }
    return list.sort((a, b) => (b.message.sentAt ?? 0) - (a.message.sentAt ?? 0));
  }, [current, conversations, mine]);

  const unreadNotifications = notifications.filter((n) => n.unread).length;

  const replyId = replyTo[key];
  const replyTarget = replyId ? messages.find((m) => m.id === replyId) : undefined;

  const activity = useMemo(() => {
    let unread = dmUnread;
    let attention = dmUnread;
    for (const lounge of LOUNGES) {
      const totals = serverUnread(lounge.id);
      unread += totals.unread;
      attention += totals.mentions;
    }
    return { unread, attention };
  }, [dmUnread, serverUnread]);

  /* --------------------------------------------------------------- actions */

  const syncRoute = useCallback(
    (target: ChatRoom, routeServer?: ServerId) => {
      const targetKey = keyOf(target);
      const focusMessageId = pendingFocus.current;
      pendingFocus.current = undefined;
      const parsed = target.kind === "channel" ? parseChannelId(target.channelId) : null;
      const nextServer = routeServer ?? parsed?.server;
      if (nextServer) setServerId(nextServer);
      if (target.kind === "channel" && nextServer) setLastChannel((previous) => ({ ...previous, [nextServer]: target.channelId }));

      const source = latest.current.current;
      const waiting =
        target.kind === "channel"
          ? (source?.overview.channels.find((c) => c.id === target.channelId)?.unread ?? 0)
          : (source?.overview.conversations.find((c) => c.memberId === memberOfConversation(target.conversationId))?.unread ?? 0);
      const sameRoom = latest.current.active && keyOf(latest.current.room) === targetKey;
      setDivider((previous) => (waiting > 0 ? { key: targetKey, count: waiting } : sameRoom || previous?.key === targetKey ? previous : null));
      setRoom(target);
      setActive(true);
      setFocus(focusMessageId ? { messageId: focusMessageId, nonce: ++focusNonce } : null);

      const cache = latest.current.rooms[targetKey];
      if (!cache || cache.status === "error" || Date.now() - cache.loadedAt > ROOM_FRESH_MS) void loadRoom(target);
      if (waiting > 0) markRoomsRead([target]);

      /* Visiting a lounge lists the member among its members. */
      const own = source && latest.current.userId ? source.members[latest.current.userId] : undefined;
      if (nextServer && own && !own.languages.includes(nextServer)) {
        void api
          .joinLounge(nextServer)
          .then(refreshDirectory)
          .catch(() => undefined);
      }
    },
    [loadRoom, markRoomsRead, refreshDirectory],
  );

  /* The lounge's data arrived after its address was read: read the room now. */
  useEffect(() => {
    if (status === "ready" && active && !latest.current.rooms[keyOf(latest.current.room)]) void loadRoom(latest.current.room);
  }, [status, active, loadRoom]);

  /* A conversation's first message created it: its room can be read now. */
  const conversationCount = current?.overview.conversations.length ?? 0;
  useEffect(() => {
    const target = latest.current.room;
    if (target.kind !== "dm" || !latest.current.active) return;
    const cache = latest.current.rooms[keyOf(target)];
    if (cache?.status === "ready" && cache.messages.length === 0 && conversationIdWith(memberOfConversation(target.conversationId))) {
      void loadRoom(target);
    }
  }, [conversationCount, conversationIdWith, loadRoom]);

  const leave = useCallback(() => {
    setActive(false);
    setFocus(null);
  }, []);

  const openRoom = useCallback(
    (target: ChatRoom, focusMessageId?: string) => {
      if (latest.current.active && keyOf(target) === keyOf(latest.current.room)) {
        if (focusMessageId) setFocus({ messageId: focusMessageId, nonce: ++focusNonce });
        return;
      }
      pendingFocus.current = focusMessageId;
      navigate(loungePath(target));
    },
    [navigate],
  );

  const selectServer = useCallback(
    (id: ServerId) => {
      if (id !== serverId) navigate(loungePath(channelRoom(lastChannel[id])));
    },
    [navigate, serverId, lastChannel],
  );

  const openConversationWith = useCallback(
    (memberId: string) => {
      setComposerFocus((n) => n + 1);
      openRoom(dmRoom(memberId));
    },
    [openRoom],
  );

  const send = useCallback(
    async (parts: MessagePart[], attachments: ChatAttachment[] = []): Promise<SendResult> => {
      const owner = latest.current.userId;
      if (!owner) return { ok: false, reason: "failed" };
      const target = room;
      const roomKey = keyOf(target);
      const recipientId = target.kind === "dm" ? memberOfConversation(target.conversationId) : null;
      const reply = replyTo[roomKey];
      const localId = `pending-${++pendingIds}`;
      upsertMessage(roomKey, { id: localId, authorId: owner, minutesAgo: 0, sentAt: Date.now(), parts, replyToId: reply, attachments: attachments.length ? attachments : undefined, pending: true });

      let uploaded: Array<{ path: string; alt: string }> = [];
      try {
        const files = attachments.flatMap((a) => (a.file ? [{ file: a.file, alt: a.alt }] : []));
        uploaded = await api.uploadImages(owner, files);
        const id = await api.postMessage({
          channelId: target.kind === "channel" ? target.channelId : null,
          recipientId,
          parts,
          replyToId: reply,
          attachments: uploaded,
        });
        setDrafts((previous) => ({ ...previous, [roomKey]: "" }));
        setReplyTo((previous) => ({ ...previous, [roomKey]: undefined }));
        setDivider((previous) => (previous?.key === roomKey ? null : previous));
        const full = await api.fetchMessage(id).catch(() => null);
        const [message] = full ? await mapRows([full]).catch(() => []) : [];
        if (message) upsertMessage(roomKey, message, localId);
        else upsertMessage(roomKey, { id, authorId: owner, minutesAgo: 0, sentAt: Date.now(), parts, replyToId: reply }, localId);
        if (target.kind === "dm") void refreshOverview();
        return { ok: true };
      } catch (error) {
        setRooms((previous) => {
          const cache = previous[roomKey];
          return cache ? { ...previous, [roomKey]: { ...cache, messages: cache.messages.filter((m) => m.id !== localId) } } : previous;
        });
        void api.removeImages(uploaded.map((u) => u.path)).catch(() => undefined);
        return { ok: false, reason: error instanceof api.LoungeError ? error.reason : "failed" };
      }
    },
    [room, replyTo, upsertMessage, mapRows, refreshOverview],
  );

  const react = useCallback(
    (message: ChatMessage, reaction: ChatReaction) => {
      if (message.pending) return;
      const before = latest.current.mine[message.id] ?? message.mine ?? [];
      setMine((previous) => ({ ...previous, [message.id]: toggleIn(before, reaction) }));
      api.toggleReaction(message.id, reaction).catch(() => setMine((previous) => ({ ...previous, [message.id]: before })));
    },
    [],
  );

  const markRead = useCallback((target: ChatRoom) => markRoomsRead([target]), [markRoomsRead]);
  const markServerRead = useCallback(
    (id: ServerId) => markRoomsRead(CHANNEL_KEYS.map((channelKey) => channelRoom(channelIdOf(id, channelKey)))),
    [markRoomsRead],
  );

  const toggleMute = useCallback(
    (target: ChatRoom) => {
      const source = latest.current.current;
      if (!source) return;
      let ref: { channelId: string } | { conversationId: string } | null = null;
      let muted = false;
      if (target.kind === "channel") {
        ref = { channelId: target.channelId };
        muted = source.overview.channels.find((c) => c.id === target.channelId)?.muted ?? false;
      } else {
        const conversationId = conversationIdWith(memberOfConversation(target.conversationId), source);
        if (conversationId) {
          ref = { conversationId };
          muted = source.overview.conversations.find((c) => c.id === conversationId)?.muted ?? false;
        }
      }
      if (!ref) return;
      const next = !muted;
      const apply = (value: boolean) =>
        setData((previous) =>
          previous
            ? {
                ...previous,
                overview: {
                  channels: previous.overview.channels.map((c) => ("channelId" in ref! && c.id === ref.channelId ? { ...c, muted: value } : c)),
                  conversations: previous.overview.conversations.map((c) =>
                    "conversationId" in ref! && c.id === ref.conversationId ? { ...c, muted: value } : c,
                  ),
                },
              }
            : previous,
        );
      apply(next);
      api.setMuted(ref, next).catch(() => apply(muted));
    },
    [conversationIdWith],
  );

  const setDraft = useCallback((text: string) => setDrafts((previous) => ({ ...previous, [key]: text })), [key]);
  const replyToMessage = useCallback(
    (message?: ChatMessage) => {
      setReplyTo((previous) => ({ ...previous, [key]: message?.id }));
      if (message) setComposerFocus((n) => n + 1);
    },
    [key],
  );
  const mention = useCallback(
    (member: ChatMember) => {
      setDrafts((previous) => {
        const text = previous[key] ?? "";
        const spacer = text && !/\s$/.test(text) ? " " : "";
        return { ...previous, [key]: `${text}${spacer}@${member.handle} ` };
      });
      setComposerFocus((n) => n + 1);
    },
    [key],
  );

  const readNotifications = useCallback(
    (ids: string[]) => {
      const rows = ids.filter((id) => !id.startsWith("dm:"));
      if (rows.length === 0) return;
      const now = new Date().toISOString();
      setData((previous) =>
        previous
          ? { ...previous, notifications: previous.notifications.map((n) => (rows.includes(n.id) && !n.read_at ? { ...n, read_at: now } : n)) }
          : previous,
      );
      api.readNotifications(rows).catch(() => void refreshNotifications());
    },
    [refreshNotifications],
  );

  const setPresence = useCallback((next: Presence) => {
    setPresenceState(next);
    void api.heartbeat(next).catch(() => undefined);
  }, []);

  const focusComposer = useCallback(() => setComposerFocus((n) => n + 1), []);

  const retry = useCallback(() => {
    if (status === "error") setAttempt((n) => n + 1);
    else if (latest.current.rooms[keyOf(latest.current.room)]?.status === "error") void loadRoom(latest.current.room);
  }, [status, loadRoom]);

  const allMembers = activeMembers;
  const serverMembers = useMemo(() => activeMembers.filter((m) => m.languages.includes(server.id)), [activeMembers, server.id]);

  const value: ChatContextValue = {
    status: enabled ? status : "loading",
    roomStatus,
    retry,
    servers,
    server,
    room,
    roomKey: key,
    viewer,
    memberOf: (id) => (id === userId ? viewer : memberOf(id)),
    nameOf: (id) => (id === userId ? viewer.name : nameOf(id)),
    serverMembers,
    allMembers,
    channels,
    channelsOf,
    currentChannel,
    serverUnread,
    conversations,
    currentConversation,
    dmUnread,
    messagesOf,
    messages,
    divider: divider?.key === key ? divider.count : 0,
    reactionsMine,
    notifications,
    unreadNotifications,
    draft: drafts[key] ?? "",
    replyTarget,
    typingMember: undefined,
    muted: currentChannel?.muted ?? (currentConversation ? (current?.overview.conversations.find((c) => c.memberId === currentConversation.member.id)?.muted ?? false) : false),
    focus,
    composerFocus,
    presence,
    activity,
    syncRoute,
    leave,
    selectServer,
    openRoom,
    openConversationWith,
    send,
    react,
    markRead,
    markServerRead,
    toggleMute,
    setDraft,
    replyToMessage,
    mention,
    readNotifications,
    setPresence,
    focusComposer,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

