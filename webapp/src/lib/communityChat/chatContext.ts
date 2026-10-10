import { createContext, useContext } from "react";
import type {
  ChatAttachment,
  ChatChannel,
  ChatMember,
  ChatMessage,
  ChatReaction,
  ChatServer,
  DirectConversation,
  MessagePart,
  Presence,
  ServerId,
} from "./model";
import type { ChatRoom } from "./chatLogic";

/**
 * State of the Members' Lounge for the signed-in member: what the screens
 * read (`useChat()`) and the actions they call.
 *
 * Two sources behind one contract, chosen once like the other domains
 * (`isSupabaseConfigured`):
 *  - `liveChatStore.tsx` — Supabase: the database decides who may enter, what
 *    can be read and written (RLS and the `lounge_*` functions), Realtime
 *    brings new messages and notifications;
 *  - `mockChatStore.tsx` — the prototype's fixtures and local state, for the
 *    mock mode only (no Supabase: local preview, Playwright smoke tests).
 */

export type NotificationKind = "mention" | "reply" | "reaction" | "dm";

export interface ChatNotification {
  id: string;
  kind: NotificationKind;
  room: ChatRoom;
  /** Lounge of a channel notification; absent for private messages. */
  serverId?: ServerId;
  /** Who acted: the author of the mention/reply/message, a reactor otherwise. */
  actorId: string;
  message: ChatMessage;
  /** Reactions on the viewer's message, for a reaction notification. */
  reactionCount?: number;
  unread: boolean;
}

export interface ChannelView extends ChatChannel {
  serverId: ServerId;
  unread: number;
  mentions: number;
  muted: boolean;
}

export interface ConversationView {
  conversation: DirectConversation;
  member: ChatMember;
  last?: ChatMessage;
  unread: number;
}

/** Where some data stands: on its way, there, or failed (with a way to try again). */
export type LoadStatus = "loading" | "ready" | "error";

export type SendResult = { ok: true } | { ok: false; reason: "rateLimited" | "forbidden" | "failed" };

export interface ChatContextValue {
  /** The lounge itself: members, rooms and counts. */
  status: LoadStatus;
  /** The messages of the room on screen. */
  roomStatus: LoadStatus;
  /** Reads again whatever failed. */
  retry: () => void;

  servers: ChatServer[];
  server: ChatServer;
  room: ChatRoom;
  roomKey: string;
  viewer: ChatMember;
  memberOf: (id: string) => ChatMember | undefined;
  nameOf: (id: string) => string;
  /** Members of the current lounge, the viewer excluded. */
  serverMembers: ChatMember[];
  /** Everyone the viewer can write to: every member of every lounge, the viewer excluded. */
  allMembers: ChatMember[];

  channels: ChannelView[];
  channelsOf: (serverId: ServerId) => ChannelView[];
  currentChannel?: ChannelView;
  serverUnread: (serverId: ServerId) => { unread: number; mentions: number };

  conversations: ConversationView[];
  currentConversation?: ConversationView;
  dmUnread: number;

  messagesOf: (room: ChatRoom) => ChatMessage[];
  messages: ChatMessage[];
  divider: number;
  reactionsMine: (message: ChatMessage) => ChatReaction[];

  notifications: ChatNotification[];
  unreadNotifications: number;

  draft: string;
  replyTarget?: ChatMessage;
  typingMember?: ChatMember;
  muted: boolean;
  focus: { messageId: string; nonce: number } | null;
  composerFocus: number;
  presence: Presence;

  /** Everything waiting across the lounges: unread messages, and what is addressed to you (mentions, private messages). */
  activity: { unread: number; attention: number };

  /** Called by the lounge with the room of its address (`loungeRoutes.ts`). */
  syncRoute: (room: ChatRoom, serverId?: ServerId) => void;
  /** Called when the lounge leaves the screen. */
  leave: () => void;
  selectServer: (serverId: ServerId) => void;
  /** Goes to a room's address; the room opens when the lounge reads it. */
  openRoom: (room: ChatRoom, focusMessageId?: string) => void;
  openConversationWith: (memberId: string) => void;
  /** Sends to the room on screen; resolves once the server took it (or refused it). */
  send: (parts: MessagePart[], attachments?: ChatAttachment[]) => Promise<SendResult>;
  react: (message: ChatMessage, reaction: ChatReaction) => void;
  markRead: (room: ChatRoom) => void;
  markServerRead: (serverId: ServerId) => void;
  toggleMute: (room: ChatRoom) => void;
  setDraft: (text: string) => void;
  replyToMessage: (message?: ChatMessage) => void;
  mention: (member: ChatMember) => void;
  readNotifications: (ids: string[]) => void;
  setPresence: (presence: Presence) => void;
  focusComposer: () => void;
}

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
