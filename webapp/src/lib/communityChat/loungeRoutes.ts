import {
  CHANNEL_KEYS,
  DEFAULT_SERVER,
  channelId,
  directConversationId,
  isServerId,
  memberOfConversation,
  parseChannelId,
  type ChannelKey,
  type ServerId,
} from "./model";
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
 * the lounge segment is the language code. Channels are fixed structure
 * (`model.ts`), so their addresses are checked here; whether a member exists
 * is only known once the lounge has read its members, so the lounge itself
 * turns an unknown member into the 404.
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

/** What a member id in an address may look like (a uuid live, a short id in the fixtures). */
const MEMBER_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

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
    return `${LOUNGE_ROOT}/${MESSAGES_SEGMENT}/${encodeURIComponent(memberOfConversation(room.conversationId))}`;
  }
  const channel = parseChannelId(room.channelId);
  return channel ? `${LOUNGE_ROOT}/${channel.server}/${CHANNEL_SLUGS[channel.key]}` : DEFAULT_LOUNGE_PATH;
}

/** What an address under `/compte/salons` points to. */
export function parseLoungePath(pathname: string): LoungeRoute {
  if (!isLoungePath(pathname)) return { kind: "notFound" };
  const rest = pathname.slice(LOUNGE_ROOT.length).replace(/^\/+|\/+$/g, "");
  if (!rest) return { kind: "index" };
  let segments: string[];
  try {
    segments = rest.split("/").map((segment) => decodeURIComponent(segment));
  } catch {
    return { kind: "notFound" };
  }
  if (segments.length !== 2) return { kind: "notFound" };
  const [first, second] = segments;

  if (first === MESSAGES_SEGMENT) {
    if (!MEMBER_SEGMENT.test(second)) return { kind: "notFound" };
    return { kind: "room", room: { kind: "dm", conversationId: directConversationId(second) } };
  }

  const key = SLUG_KEYS[second];
  if (!isServerId(first) || !key || !(CHANNEL_KEYS as readonly string[]).includes(key)) return { kind: "notFound" };
  return { kind: "room", room: { kind: "channel", channelId: channelId(first, key) }, serverId: first };
}
