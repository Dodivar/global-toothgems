import {
  CHANNEL_KEYS,
  CHAT_MEMBERS,
  CHAT_SERVERS,
  CHAT_VIEWER_ID,
  DEFAULT_SERVER,
  directConversationId,
  type ChannelKey,
  type ServerId,
} from "../../data/communityChat";
import type { ChatRoom } from "./chatLogic";

/**
 * Addresses of the Members' Lounge, one per room, so the browser's Back
 * button walks from channel to channel and a channel can be linked to:
 *
 *   /compte/salons                        → the last room visited (or the default one)
 *   /compte/salons/<lounge>/<channel>      e.g. /compte/salons/fr/techniques
 *   /compte/salons/messages/<member>       a private conversation
 *
 * Internal paths of the member space are French, like the rest of `/compte`;
 * the lounge segment is the language code.
 */
export const LOUNGE_ROOT = "/compte/salons";

const CHANNEL_SLUGS: Record<ChannelKey, string> = {
  introductions: "presentations",
  general: "discussion",
  inspiration: "inspiration",
  techniques: "techniques",
  business: "business",
};

const SLUG_KEYS = Object.fromEntries(Object.entries(CHANNEL_SLUGS).map(([key, slug]) => [slug, key])) as Record<string, ChannelKey>;

const MESSAGES_SEGMENT = "messages";

export const DEFAULT_LOUNGE_PATH = `${LOUNGE_ROOT}/${DEFAULT_SERVER}/${CHANNEL_SLUGS.general}`;

export type LoungeRoute =
  | { kind: "index" }
  | { kind: "room"; room: ChatRoom; serverId?: ServerId }
  | { kind: "notFound" };

export function isLoungePath(pathname: string): boolean {
  return pathname === LOUNGE_ROOT || pathname.startsWith(`${LOUNGE_ROOT}/`);
}

/** The address of a room. */
export function loungePath(room: ChatRoom): string {
  if (room.kind === "dm") {
    const memberId = room.conversationId.replace(/^dm-/, "");
    return `${LOUNGE_ROOT}/${MESSAGES_SEGMENT}/${encodeURIComponent(memberId)}`;
  }
  for (const server of CHAT_SERVERS) {
    const channel = server.channels.find((c) => c.id === room.channelId);
    if (channel) return `${LOUNGE_ROOT}/${server.id}/${CHANNEL_SLUGS[channel.key]}`;
  }
  return DEFAULT_LOUNGE_PATH;
}

/** What an address under `/compte/salons` points to. */
export function parseLoungePath(pathname: string): LoungeRoute {
  if (!isLoungePath(pathname)) return { kind: "notFound" };
  const rest = pathname.slice(LOUNGE_ROOT.length).replace(/^\/+|\/+$/g, "");
  if (!rest) return { kind: "index" };
  const segments = rest.split("/").map((segment) => decodeURIComponent(segment));
  if (segments.length !== 2) return { kind: "notFound" };
  const [first, second] = segments;

  if (first === MESSAGES_SEGMENT) {
    const member = CHAT_MEMBERS.find((m) => m.id === second);
    if (!member || member.id === CHAT_VIEWER_ID) return { kind: "notFound" };
    return { kind: "room", room: { kind: "dm", conversationId: directConversationId(member.id) } };
  }

  const server = CHAT_SERVERS.find((s) => s.id === first);
  const key = SLUG_KEYS[second];
  if (!server || !key || !(CHANNEL_KEYS as readonly string[]).includes(key)) return { kind: "notFound" };
  const channel = server.channels.find((c) => c.key === key);
  if (!channel) return { kind: "notFound" };
  return { kind: "room", room: { kind: "channel", channelId: channel.id }, serverId: server.id };
}
