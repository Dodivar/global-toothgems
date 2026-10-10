"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import {
  CHAT_MEMBERS,
  CHAT_SERVERS,
  CHAT_VIEWER_ID,
  DEFAULT_SERVER,
  DEMO_AUTO_REPLY,
  DIRECT_CONVERSATIONS,
  directConversationId,
  getChatMember,
  type ChatAttachment,
  type ChatMember,
  type ChatMessage,
  type ChatReaction,
  type DirectConversation,
  type MessagePart,
  type Presence,
  type ServerId,
} from "../../data/communityChat";
import { useCommunity } from "../community";
import { useNavigate } from "../navigation";
import { loungePath } from "./loungeRoutes";
import {
  chronological,
  mentionsMember,
  roomKey,
  toggleReaction as toggleIn,
  type ChatRoom,
} from "./chatLogic";
import {
  ChatContext,
  type ChannelView,
  type ChatContextValue,
  type ChatNotification,
  type ConversationView,
  type SendResult,
} from "./chatContext";

/**
 * The Members' Lounge in mock mode (no Supabase: local preview, Playwright
 * smoke tests): the fixtures of `data/communityChat.ts` and local state, in
 * memory, reset on reload. Nothing is sent anywhere and nothing is verified.
 * With Supabase, `liveChatStore.tsx` serves the same contract
 * (`chatContext.ts`) from the database.
 */

interface State {
  serverId: ServerId;
  room: ChatRoom;
  /** Whether the lounge is on screen: it reads `room`, and messages arriving there are read. */
  active: boolean;
  /** Last channel open in each lounge, so switching back lands where you were. */
  lastChannel: Record<ServerId, string>;
  /** Messages written during the session, by room key. */
  sent: Record<string, ChatMessage[]>;
  /** The viewer's reactions per message, once they changed them. */
  mine: Record<string, ChatReaction[]>;
  /** Unread messages per room key. */
  unread: Record<string, number>;
  /** Unread count of the room at the moment it was opened: where "New" goes. */
  divider: { key: string; count: number } | null;
  muted: string[];
  /** Conversations started during the session, newest first. */
  started: DirectConversation[];
  readNotifications: string[];
  drafts: Record<string, string>;
  replyTo: Record<string, string | undefined>;
  typing: Record<string, string | undefined>;
  presence: Presence;
  /** A message to scroll to and flash once, from search or the inbox. */
  focus: { messageId: string; nonce: number } | null;
  /** Bumped when something asks the composer to take the keyboard. */
  composerFocus: number;
}

type Action =
  | { type: "leave" }
  | { type: "open"; room: ChatRoom; serverId?: ServerId; focusMessageId?: string }
  | { type: "send"; key: string; message: ChatMessage }
  | { type: "receive"; key: string; message: ChatMessage }
  | { type: "react"; messageId: string; current: ChatReaction[]; reaction: ChatReaction }
  | { type: "markRead"; keys: string[] }
  | { type: "mute"; key: string }
  | { type: "readNotifications"; ids: string[] }
  | { type: "draft"; key: string; text: string }
  | { type: "replyTo"; key: string; messageId?: string }
  | { type: "typing"; key: string; memberId?: string }
  | { type: "presence"; presence: Presence }
  | { type: "focusComposer" }
  | { type: "mention"; key: string; handle: string };

function channelRoom(channelId: string): ChatRoom {
  return { kind: "channel", channelId };
}

function serverOf(channelId: string): ServerId | undefined {
  return CHAT_SERVERS.find((server) => server.channels.some((channel) => channel.id === channelId))?.id;
}

function initialState(): State {
  const unread: Record<string, number> = {};
  for (const server of CHAT_SERVERS) {
    for (const channel of server.channels) unread[roomKey(channelRoom(channel.id))] = channel.unread;
  }
  for (const conversation of DIRECT_CONVERSATIONS) {
    unread[roomKey({ kind: "dm", conversationId: conversation.id })] = conversation.unread;
  }
  const lastChannel = Object.fromEntries(
    CHAT_SERVERS.map((server) => [server.id, server.channels.find((c) => c.key === "general")?.id ?? server.channels[0].id]),
  ) as Record<ServerId, string>;

  /* Nothing is opened, nor read, until the lounge shows a room (`syncRoute`). */
  return {
    serverId: DEFAULT_SERVER,
    room: channelRoom(lastChannel[DEFAULT_SERVER]),
    active: false,
    lastChannel,
    sent: {},
    mine: {},
    unread,
    divider: null,
    muted: [],
    started: [],
    readNotifications: [],
    drafts: {},
    replyTo: {},
    typing: {},
    presence: "online",
    focus: null,
    composerFocus: 0,
  };
}

let focusNonce = 0;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "leave":
      return { ...state, active: false, focus: null };
    case "open": {
      const key = roomKey(action.room);
      /* A private conversation opened by its address exists from then on. */
      const started =
        action.room.kind === "dm" &&
        !DIRECT_CONVERSATIONS.some((c) => c.id === (action.room as { conversationId: string }).conversationId) &&
        !state.started.some((c) => c.id === (action.room as { conversationId: string }).conversationId)
          ? [{ id: action.room.conversationId, memberId: action.room.conversationId.replace(/^dm-/, ""), unread: 0, messages: [] }, ...state.started]
          : state.started;
      const serverId =
        action.serverId ?? (action.room.kind === "channel" ? serverOf(action.room.channelId) : undefined) ?? state.serverId;
      const lastChannel =
        action.room.kind === "channel" ? { ...state.lastChannel, [serverId]: action.room.channelId } : state.lastChannel;
      const pending = state.unread[key] ?? 0;
      const sameRoom = state.active && roomKey(state.room) === key;
      return {
        ...state,
        started,
        serverId,
        room: action.room,
        active: true,
        lastChannel,
        unread: { ...state.unread, [key]: 0 },
        /* Unread messages move the marker; reopening a room with none waiting
           keeps the marker it had (the lounge may be mounted twice). */
        divider: pending > 0 ? { key, count: pending } : sameRoom || state.divider?.key === key ? state.divider : null,
        focus: action.focusMessageId ? { messageId: action.focusMessageId, nonce: ++focusNonce } : null,
      };
    }
    case "send":
      return {
        ...state,
        sent: { ...state.sent, [action.key]: [...(state.sent[action.key] ?? []), action.message] },
        drafts: { ...state.drafts, [action.key]: "" },
        replyTo: { ...state.replyTo, [action.key]: undefined },
        /* Writing in a room means having read it. */
        divider: state.divider?.key === action.key ? null : state.divider,
      };
    case "receive": {
      const here = state.active && roomKey(state.room) === action.key;
      return {
        ...state,
        sent: { ...state.sent, [action.key]: [...(state.sent[action.key] ?? []), action.message] },
        unread: here ? state.unread : { ...state.unread, [action.key]: (state.unread[action.key] ?? 0) + 1 },
        typing: { ...state.typing, [action.key]: undefined },
      };
    }
    case "react":
      return { ...state, mine: { ...state.mine, [action.messageId]: toggleIn(action.current, action.reaction) } };
    case "markRead": {
      const unread = { ...state.unread };
      for (const key of action.keys) unread[key] = 0;
      return { ...state, unread };
    }
    case "mute":
      return {
        ...state,
        muted: state.muted.includes(action.key) ? state.muted.filter((k) => k !== action.key) : [...state.muted, action.key],
      };
    case "readNotifications":
      return { ...state, readNotifications: [...new Set([...state.readNotifications, ...action.ids])] };
    case "draft":
      return { ...state, drafts: { ...state.drafts, [action.key]: action.text } };
    case "replyTo":
      return {
        ...state,
        replyTo: { ...state.replyTo, [action.key]: action.messageId },
        composerFocus: action.messageId ? state.composerFocus + 1 : state.composerFocus,
      };
    case "typing":
      return { ...state, typing: { ...state.typing, [action.key]: action.memberId } };
    case "presence":
      return { ...state, presence: action.presence };
    case "focusComposer":
      return { ...state, composerFocus: state.composerFocus + 1 };
    case "mention": {
      const current = state.drafts[action.key] ?? "";
      const spacer = current && !/\s$/.test(current) ? " " : "";
      return {
        ...state,
        drafts: { ...state.drafts, [action.key]: `${current}${spacer}@${action.handle} ` },
        composerFocus: state.composerFocus + 1,
      };
    }
  }
}

let localIds = 0;

const noop = () => {};

export function MockChatProvider({ children }: { children: ReactNode }) {
  const { viewer: communityViewer } = useCommunity();
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const timers = useRef<number[]>([]);
  const navigate = useNavigate();
  /* A message to bring into view once the address it lives at is open. */
  const pendingFocus = useRef<string | undefined>(undefined);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  const viewer = useMemo<ChatMember>(
    () => ({
      id: CHAT_VIEWER_ID,
      name: communityViewer.name,
      handle: "me",
      city: communityViewer.location ?? "",
      country: "",
      languages: [state.serverId],
      presence: state.presence,
      trainings: ["foundations"],
      bio: communityViewer.bio,
      joined: communityViewer.joined.slice(0, 7),
      messageCount: Object.values(state.sent).reduce((sum, list) => sum + list.filter((m) => m.authorId === CHAT_VIEWER_ID).length, 4),
      helpfulCount: 0,
      tone: communityViewer.tone,
    }),
    [communityViewer, state.presence, state.serverId, state.sent],
  );

  const memberOf = useCallback((id: string) => (id === CHAT_VIEWER_ID ? viewer : getChatMember(id)), [viewer]);
  const nameOf = useCallback((id: string) => memberOf(id)?.name ?? "—", [memberOf]);

  const server = CHAT_SERVERS.find((s) => s.id === state.serverId) ?? CHAT_SERVERS[0];
  const key = roomKey(state.room);

  const messagesOf = useCallback(
    (room: ChatRoom) => {
      const k = roomKey(room);
      let seeded: ChatMessage[] = [];
      if (room.kind === "channel") {
        seeded = CHAT_SERVERS.flatMap((s) => s.channels).find((c) => c.id === room.channelId)?.messages ?? [];
      } else {
        seeded = DIRECT_CONVERSATIONS.find((c) => c.id === room.conversationId)?.messages ?? [];
      }
      return [...chronological(seeded), ...(state.sent[k] ?? [])];
    },
    [state.sent],
  );

  const channelsOf = useCallback(
    (serverId: ServerId): ChannelView[] => {
      const s = CHAT_SERVERS.find((x) => x.id === serverId) ?? CHAT_SERVERS[0];
      return s.channels.map((channel) => {
        const k = roomKey(channelRoom(channel.id));
        const unread = state.unread[k] ?? 0;
        const list = chronological(channel.messages);
        const mentions = unread > 0 ? list.slice(-unread).filter((m) => mentionsMember(m, CHAT_VIEWER_ID)).length : 0;
        return { ...channel, serverId: s.id, unread, mentions, muted: state.muted.includes(k) };
      });
    },
    [state.unread, state.muted],
  );

  const channels = useMemo(() => channelsOf(server.id), [channelsOf, server.id]);

  const serverUnread = useCallback(
    (serverId: ServerId) =>
      channelsOf(serverId).reduce(
        (sum, channel) => ({
          unread: sum.unread + (channel.muted ? 0 : channel.unread),
          mentions: sum.mentions + channel.mentions,
        }),
        { unread: 0, mentions: 0 },
      ),
    [channelsOf],
  );

  const conversations = useMemo<ConversationView[]>(() => {
    const all = [...state.started, ...DIRECT_CONVERSATIONS];
    return all
      .map((conversation) => {
        const list = messagesOf({ kind: "dm", conversationId: conversation.id });
        return {
          conversation,
          member: getChatMember(conversation.memberId)!,
          last: list[list.length - 1],
          unread: state.unread[roomKey({ kind: "dm", conversationId: conversation.id })] ?? 0,
        };
      })
      .filter((view) => view.member)
      .sort((a, b) => (a.last?.minutesAgo ?? -1) - (b.last?.minutesAgo ?? -1));
  }, [state.started, state.unread, messagesOf]);

  const dmUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  const currentChannel = state.room.kind === "channel" ? channels.find((c) => c.id === (state.room as { channelId: string }).channelId) : undefined;
  const currentConversation =
    state.room.kind === "dm" ? conversations.find((c) => c.conversation.id === (state.room as { conversationId: string }).conversationId) : undefined;

  const messages = useMemo(() => messagesOf(state.room), [messagesOf, state.room]);

  const reactionsMine = useCallback((message: ChatMessage) => state.mine[message.id] ?? message.mine ?? [], [state.mine]);

  /*
   * The inbox, derived from the rooms rather than stored: what a backend would
   * send as notification rows. Mentions are unread while their message is
   * among the room's unread ones; replies and reactions until dismissed.
   */
  const notifications = useMemo<ChatNotification[]>(() => {
    const list: ChatNotification[] = [];
    const read = new Set(state.readNotifications);
    for (const s of CHAT_SERVERS) {
      for (const channel of s.channels) {
        const room = channelRoom(channel.id);
        const ordered = messagesOf(room);
        const unread = state.unread[roomKey(room)] ?? 0;
        const viewerMessages = new Set(ordered.filter((m) => m.authorId === CHAT_VIEWER_ID).map((m) => m.id));
        ordered.forEach((message, index) => {
          if (message.authorId === CHAT_VIEWER_ID) {
            const others = Object.values(message.reactions ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
            if (others > 0) {
              const id = `reaction:${message.id}`;
              list.push({ id, kind: "reaction", room, serverId: s.id, actorId: "", message, reactionCount: others, unread: !read.has(id) });
            }
            return;
          }
          if (mentionsMember(message, CHAT_VIEWER_ID)) {
            const id = `mention:${message.id}`;
            const isUnread = index >= ordered.length - unread && !read.has(id);
            list.push({ id, kind: "mention", room, serverId: s.id, actorId: message.authorId, message, unread: isUnread });
          } else if (message.replyToId && viewerMessages.has(message.replyToId)) {
            const id = `reply:${message.id}`;
            list.push({ id, kind: "reply", room, serverId: s.id, actorId: message.authorId, message, unread: !read.has(id) });
          }
        });
      }
    }
    for (const view of conversations) {
      if (view.unread > 0 && view.last) {
        const room: ChatRoom = { kind: "dm", conversationId: view.conversation.id };
        list.push({ id: `dm:${view.last.id}`, kind: "dm", room, actorId: view.member.id, message: view.last, unread: true });
      }
    }
    return list.sort((a, b) => a.message.minutesAgo - b.message.minutesAgo);
  }, [messagesOf, state.unread, state.readNotifications, conversations]);

  const unreadNotifications = notifications.filter((n) => n.unread).length;

  const replyId = state.replyTo[key];
  const replyTarget = replyId ? messages.find((m) => m.id === replyId) : undefined;
  const typingId = state.typing[key];
  const typingMember = typingId ? getChatMember(typingId) : undefined;

  const syncRoute = useCallback((room: ChatRoom, serverId?: ServerId) => {
    const focusMessageId = pendingFocus.current;
    pendingFocus.current = undefined;
    dispatch({ type: "open", room, serverId, focusMessageId });
  }, []);
  const leave = useCallback(() => dispatch({ type: "leave" }), []);

  const openRoom = useCallback(
    (room: ChatRoom, focusMessageId?: string) => {
      if (state.active && roomKey(room) === roomKey(state.room)) {
        dispatch({ type: "open", room, focusMessageId });
        return;
      }
      pendingFocus.current = focusMessageId;
      navigate(loungePath(room));
    },
    [navigate, state.active, state.room],
  );
  const selectServer = useCallback(
    (serverId: ServerId) => {
      if (serverId !== state.serverId) navigate(loungePath(channelRoom(state.lastChannel[serverId])));
    },
    [navigate, state.serverId, state.lastChannel],
  );
  const openConversationWith = useCallback(
    (memberId: string) => {
      dispatch({ type: "focusComposer" });
      openRoom({ kind: "dm", conversationId: directConversationId(memberId) });
    },
    [openRoom],
  );

  const send = useCallback(
    (parts: MessagePart[], attachments?: ChatAttachment[]): Promise<SendResult> => {
      const message: ChatMessage = {
        id: `local-${++localIds}`,
        authorId: CHAT_VIEWER_ID,
        minutesAgo: 0,
        sentAt: Date.now(),
        parts,
        replyToId: replyId,
        attachments: attachments?.length ? attachments : undefined,
      };
      dispatch({ type: "send", key, message });

      /* Prototype only: a member you write to privately answers, after a
         typing indicator, so the conversation can be felt end to end. */
      if (state.room.kind === "dm" && currentConversation && currentConversation.member.presence !== "offline") {
        const memberId = currentConversation.member.id;
        const lang = currentConversation.member.languages[0];
        const dmKey = key;
        timers.current.push(
          window.setTimeout(() => dispatch({ type: "typing", key: dmKey, memberId }), 700),
          window.setTimeout(() => {
            dispatch({
              type: "receive",
              key: dmKey,
              message: {
                id: `local-${++localIds}`,
                authorId: memberId,
                minutesAgo: 0,
                sentAt: Date.now(),
                parts: [{ type: "text", text: DEMO_AUTO_REPLY[lang] }],
              },
            });
          }, 2600),
        );
      }
      return Promise.resolve({ ok: true });
    },
    [key, replyId, state.room.kind, currentConversation],
  );

  const react = useCallback(
    (message: ChatMessage, reaction: ChatReaction) =>
      dispatch({ type: "react", messageId: message.id, current: state.mine[message.id] ?? message.mine ?? [], reaction }),
    [state.mine],
  );

  const markRead = useCallback((room: ChatRoom) => dispatch({ type: "markRead", keys: [roomKey(room)] }), []);
  const markServerRead = useCallback(
    (serverId: ServerId) =>
      dispatch({
        type: "markRead",
        keys: (CHAT_SERVERS.find((s) => s.id === serverId)?.channels ?? []).map((c) => roomKey(channelRoom(c.id))),
      }),
    [],
  );
  const toggleMute = useCallback((room: ChatRoom) => dispatch({ type: "mute", key: roomKey(room) }), []);
  const setDraft = useCallback((text: string) => dispatch({ type: "draft", key, text }), [key]);
  const replyToMessage = useCallback((message?: ChatMessage) => dispatch({ type: "replyTo", key, messageId: message?.id }), [key]);
  const mention = useCallback((member: ChatMember) => dispatch({ type: "mention", key, handle: member.handle }), [key]);
  const readNotifications = useCallback((ids: string[]) => dispatch({ type: "readNotifications", ids }), []);
  const setPresence = useCallback((presence: Presence) => dispatch({ type: "presence", presence }), []);
  const focusComposer = useCallback(() => dispatch({ type: "focusComposer" }), []);

  const activity = useMemo(() => {
    let unread = dmUnread;
    let attention = dmUnread;
    for (const s of CHAT_SERVERS) {
      const totals = serverUnread(s.id);
      unread += totals.unread;
      attention += totals.mentions;
    }
    return { unread, attention };
  }, [dmUnread, serverUnread]);

  const serverMembers = useMemo(
    () => server.memberIds.map((id) => getChatMember(id)).filter((m): m is ChatMember => Boolean(m)),
    [server],
  );

  const value: ChatContextValue = {
    servers: CHAT_SERVERS,
    server,
    room: state.room,
    roomKey: key,
    viewer,
    memberOf,
    nameOf,
    serverMembers,
    allMembers: CHAT_MEMBERS,
    status: "ready",
    roomStatus: "ready",
    retry: noop,
    channels,
    channelsOf,
    currentChannel,
    serverUnread,
    conversations,
    currentConversation,
    dmUnread,
    messagesOf,
    messages,
    divider: state.divider?.key === key ? state.divider.count : 0,
    reactionsMine,
    notifications,
    unreadNotifications,
    draft: state.drafts[key] ?? "",
    replyTarget,
    typingMember,
    muted: state.muted.includes(key),
    focus: state.focus,
    composerFocus: state.composerFocus,
    presence: state.presence,
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
