import type { Localized } from "../../data/types";

/**
 * Shapes and fixed structure of the Members' Lounge, shared by the live store
 * (Supabase) and the mock one (fixtures, `data/communityChat.ts`):
 *
 *   Community
 *    ├── Language lounges → channels → messages (replies, mentions, reactions)
 *    └── Private conversations → messages
 *
 * The lounges and their five channels are product structure, the same in the
 * database (`lounge_channels`, ids `<lounge>-<key>`) and here. Channel names
 * and topics are written in each lounge's own language — the copy a member of
 * that lounge reads — not interface strings, so they live here and not in the
 * locale files.
 *
 * Mentions are tokens (`{ type: "mention", memberId }`), not `@text` to
 * re-parse: a renamed member keeps every mention pointing at them.
 */

/** Tint of a member's avatar. */
export type AvatarTone = "blue" | "emerald" | "fuchsia" | "ink";

export type ServerId = "en" | "fr" | "de" | "es";
export type Presence = "online" | "away" | "offline";
/** A role shown beside a name. Most members have none, on purpose. */
export type ChatRole = "team" | "mentor" | "new";

export interface ChatMember {
  id: string;
  name: string;
  /** What the composer inserts after `@`. Unique, lowercase. */
  handle: string;
  city?: string;
  /** ISO 3166-1 alpha-2. */
  country?: string;
  /** Lounges the member speaks in, first is their own. */
  languages: ServerId[];
  presence: Presence;
  role?: ChatRole;
  /**
   * Trainings completed: a key of `lounge.trainings.*` (fixtures) or a course
   * title (live) — shown as the translated key when there is one.
   */
  trainings: string[];
  bio?: Localized;
  /** `YYYY-MM` the member joined. */
  joined: string;
  messageCount: number;
  /** Replies other members marked as helpful (fixtures only: not built). */
  helpfulCount?: number;
  tone: AvatarTone;
}

export const CHAT_REACTIONS = ["heart", "clap", "sparkles", "laugh", "fire", "gem"] as const;
export type ChatReaction = (typeof CHAT_REACTIONS)[number];

export const CHAT_REACTION_EMOJI: Record<ChatReaction, string> = {
  heart: "❤️",
  clap: "👏",
  sparkles: "✨",
  laugh: "😂",
  fire: "🔥",
  gem: "💎",
};

export type MessagePart = { type: "text"; text: string } | { type: "mention"; memberId: string };

export interface ChatAttachment {
  kind: "image";
  /** What the page shows: a signed URL, or a local preview before sending. */
  src: string;
  name: string;
  /** Written by the author, as they would caption the photo. */
  alt: string;
  /** The picked file, until it is sent. */
  file?: File;
}

export interface ChatMessage {
  id: string;
  authorId: string;
  minutesAgo: number;
  parts: MessagePart[];
  /** The message this one answers, in the same room. */
  replyToId?: string;
  /** Totals, the viewer's own reactions included. */
  reactions?: Partial<Record<ChatReaction, number>>;
  /** Reactions the viewer holds, as the totals count them. */
  mine?: ChatReaction[];
  attachments?: ChatAttachment[];
  /** Epoch milliseconds; when absent, `minutesAgo` dates the message (fixtures). */
  sentAt?: number;
  /** Sent from this page and not confirmed by the server yet. */
  pending?: boolean;
}

/* ---------------------------------------------------------------- channels */

/** The same five rooms open in every language. */
export const CHANNEL_KEYS = ["introductions", "general", "inspiration", "techniques", "business"] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

export interface ChatChannel {
  /** `<server>-<key>`, unique across the community. */
  id: string;
  key: ChannelKey;
  /** In the server's language. */
  name: string;
  topic: string;
  /** How many of the latest messages the viewer has not seen yet. */
  unread: number;
  messages: ChatMessage[];
}

export interface ChatServer {
  id: ServerId;
  /** The language's own name, as members of that lounge write it. */
  name: string;
  /** Members of this lounge. */
  memberCount: number;
  memberIds: string[];
  channels: ChatChannel[];
}

/** The lounges, in the order the switcher shows them. */
export const LOUNGES: Array<{ id: ServerId; name: string }> = [
  { id: "en", name: "English" },
  { id: "fr", name: "Français" },
  { id: "de", name: "Deutsch" },
  { id: "es", name: "Español" },
];

export const DEFAULT_SERVER: ServerId = "en";

export function isServerId(value: string): value is ServerId {
  return LOUNGES.some((lounge) => lounge.id === value);
}

/** Name and topic of each channel, in its lounge's language. */
export const CHANNEL_COPY: Record<ServerId, Record<ChannelKey, { name: string; topic: string }>> = {
  en: {
    introductions: { name: "Introductions", topic: "New here? Say hello, tell us where you work and what you love setting." },
    general: { name: "General Discussion", topic: "Everyday questions, wins of the week and anything that doesn't fit elsewhere." },
    inspiration: { name: "Inspiration", topic: "Your work, references, colour ideas. One photo, one line about your intention." },
    techniques: { name: "Techniques & Tips", topic: "Etching, bonding, isolation, curing, tools and troubleshooting. Questions welcome at every level." },
    business: { name: "Business & Growth", topic: "Pricing, bookings, marketing, client care — the craft beyond the set." },
  },
  fr: {
    introductions: { name: "Présentations", topic: "Nouvelle ou nouveau ici ? Dites bonjour, où vous travaillez et ce que vous aimez poser." },
    general: { name: "Discussion générale", topic: "Questions du quotidien, petites victoires et tout le reste." },
    inspiration: { name: "Inspiration", topic: "Vos réalisations, vos références, vos idées couleur." },
    techniques: { name: "Techniques & astuces", topic: "Mordançage, collage, isolation, photopolymérisation, outils et dépannage." },
    business: { name: "Business & développement", topic: "Tarifs, réservations, marketing et relation client." },
  },
  de: {
    introductions: { name: "Vorstellungsrunde", topic: "Neu hier? Sag Hallo und erzähl, wo du arbeitest." },
    general: { name: "Allgemeine Diskussion", topic: "Fragen aus dem Alltag und alles andere." },
    inspiration: { name: "Inspiration", topic: "Eure Arbeiten, Referenzen und Farbideen." },
    techniques: { name: "Techniken & Tipps", topic: "Ätzen, Bonden, Trockenlegung, Lichthärtung und Fehlersuche." },
    business: { name: "Business & Wachstum", topic: "Preise, Marketing und Kundenbindung." },
  },
  es: {
    introductions: { name: "Presentaciones", topic: "¿Eres nueva o nuevo? Saluda y cuéntanos dónde trabajas." },
    general: { name: "Conversación general", topic: "Preguntas del día a día y todo lo demás." },
    inspiration: { name: "Inspiración", topic: "Vuestros trabajos, referencias e ideas de color." },
    techniques: { name: "Técnicas y consejos", topic: "Grabado, adhesión, aislamiento, fotopolimerización y dudas técnicas." },
    business: { name: "Negocio y crecimiento", topic: "Precios, reservas, marketing y fidelización." },
  },
};

export function channelId(server: ServerId, key: ChannelKey): string {
  return `${server}-${key}`;
}

/** The lounge and key of a channel id, when it is one. */
export function parseChannelId(id: string): { server: ServerId; key: ChannelKey } | null {
  const [server, key, ...rest] = id.split("-");
  if (rest.length > 0 || !isServerId(server) || !(CHANNEL_KEYS as readonly string[]).includes(key)) return null;
  return { server, key: key as ChannelKey };
}

/** A channel of the catalogue, with no messages and nothing unread. */
export function catalogChannel(server: ServerId, key: ChannelKey): ChatChannel {
  return { id: channelId(server, key), key, ...CHANNEL_COPY[server][key], unread: 0, messages: [] };
}

/** Lounges announced but not open yet — the switcher shows the community can grow. */
export const UPCOMING_SERVERS: Array<{ code: "it" | "pt"; name: string }> = [
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
];

/* ------------------------------------------------------------ conversations */

/** One private conversation per member: `dm-<memberId>`. */
export function directConversationId(memberId: string): string {
  return `dm-${memberId}`;
}

export function memberOfConversation(conversationId: string): string {
  return conversationId.replace(/^dm-/, "");
}

export interface DirectConversation {
  /** `dm-<memberId>`: one conversation per member pair. */
  id: string;
  memberId: string;
  unread: number;
  messages: ChatMessage[];
}
