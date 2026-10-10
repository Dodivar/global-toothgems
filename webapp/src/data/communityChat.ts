import type { Localized } from "./types";
/** Tint of a member's avatar. */
export type AvatarTone = "blue" | "emerald" | "fuchsia" | "ink";
import { photo } from "../lib/images";

/**
 * Mock content for the Members' Lounge (`/compte/salons`), the community's
 * chat space.
 *
 * Prototype fixtures, static and read only: nothing here is user data. The
 * shape is the one a backend would serve, so the screens can switch to it
 * without being rewritten:
 *
 *   Community
 *    ├── Language servers → channels → messages (replies, mentions, reactions)
 *    └── Direct conversations → messages
 *
 * Conventions shared with the forum fixtures:
 *  - ages are `minutesAgo`, never dates, so the room never looks a season old;
 *  - avatars are initials on a tint (no invented faces);
 *  - message text is written in the server's own language — it is content, as
 *    a member would write it, not interface copy (the chrome stays FR/EN).
 *
 * Mentions are stored as tokens (`{ type: "mention", memberId }`), not as
 * `@text` to re-parse: a renamed member keeps every mention pointing at them.
 */

/** The signed-in visitor inside the fixtures — same id as the forum's `VIEWER_ID`. */
export const CHAT_VIEWER_ID = "you";

/* ------------------------------------------------------------------ members */

export type ServerId = "en" | "fr" | "de" | "es";
export type Presence = "online" | "away" | "offline";
/** A role shown beside a name. Most members have none, on purpose. */
export type ChatRole = "team" | "mentor" | "new";
/** Global Toothgems trainings a member completed, shown on their profile. */
export type TrainingBadge = "foundations" | "advanced" | "hygiene" | "business";

export interface ChatMember {
  id: string;
  name: string;
  /** What the composer inserts after `@`. Unique, lowercase. */
  handle: string;
  city: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Lounges the member speaks in, first is their own. */
  languages: ServerId[];
  presence: Presence;
  role?: ChatRole;
  trainings: TrainingBadge[];
  bio: Localized;
  /** `YYYY-MM` the member joined. */
  joined: string;
  messageCount: number;
  /** Replies other members marked as helpful. */
  helpfulCount: number;
  tone: AvatarTone;
}

export const CHAT_MEMBERS: ChatMember[] = [
  {
    id: "emma",
    name: "Emma Martin",
    handle: "emma.martin",
    city: "Manchester",
    country: "GB",
    languages: ["en", "fr"],
    presence: "online",
    role: "mentor",
    trainings: ["foundations", "advanced", "hygiene"],
    bio: {
      fr: "Artiste tooth gem depuis 2019, studio privé à Manchester. Obsédée par les placements minimalistes et l’hygiène irréprochable.",
      en: "Tooth gem artist since 2019, private studio in Manchester. Obsessed with minimal placements and spotless hygiene.",
    },
    joined: "2025-01",
    messageCount: 1240,
    helpfulCount: 186,
    tone: "blue",
  },
  {
    id: "sarah",
    name: "Sarah Klein",
    handle: "sarah.klein",
    city: "Hamburg",
    country: "DE",
    languages: ["de", "en"],
    presence: "online",
    trainings: ["foundations", "advanced"],
    bio: {
      fr: "Je travaille en salon de beauté à Hambourg. Fan de chrome, d’opale et de compositions graphiques.",
      en: "I work in a beauty salon in Hamburg. Into chrome, opal and graphic compositions.",
    },
    joined: "2025-04",
    messageCount: 612,
    helpfulCount: 74,
    tone: "emerald",
  },
  {
    id: "lucas",
    name: "Lucas Bernard",
    handle: "lucas.bernard",
    city: "Bordeaux",
    country: "FR",
    languages: ["fr", "en"],
    presence: "away",
    trainings: ["foundations", "business"],
    bio: {
      fr: "Ancien barbier, tooth gems depuis un an. J’apprends encore, je partage ce qui marche.",
      en: "Former barber, doing tooth gems for a year. Still learning, sharing what works.",
    },
    joined: "2025-06",
    messageCount: 288,
    helpfulCount: 19,
    tone: "ink",
  },
  {
    id: "sophie",
    name: "Sophie Weber",
    handle: "sophie.weber",
    city: "Zürich",
    country: "CH",
    languages: ["de", "fr"],
    presence: "offline",
    trainings: ["foundations", "hygiene"],
    bio: {
      fr: "Assistante dentaire de formation. Je pose le samedi, je réponds aux questions d’hygiène le reste de la semaine.",
      en: "Dental assistant by training. I set gems on Saturdays and answer hygiene questions the rest of the week.",
    },
    joined: "2025-03",
    messageCount: 455,
    helpfulCount: 92,
    tone: "fuchsia",
  },
  {
    id: "camille",
    name: "Camille Dubois",
    handle: "camille.gt",
    city: "Paris",
    country: "FR",
    languages: ["fr", "en", "es"],
    presence: "online",
    role: "team",
    trainings: ["foundations", "advanced", "hygiene", "business"],
    bio: {
      fr: "Formatrice Global Toothgems. Je passe dans les salons chaque jour : posez vos questions, même les plus simples.",
      en: "Global Toothgems educator. I drop into the lounges every day — ask anything, even the simple things.",
    },
    joined: "2024-11",
    messageCount: 2104,
    helpfulCount: 410,
    tone: "ink",
  },
  {
    id: "ines",
    name: "Inès Laurent",
    handle: "ines.laurent",
    city: "Marseille",
    country: "FR",
    languages: ["fr"],
    presence: "online",
    trainings: ["foundations"],
    bio: {
      fr: "Prothésiste ongulaire qui ajoute les tooth gems à sa carte. Toujours partante pour parler photo.",
      en: "Nail tech adding tooth gems to her menu. Always up for talking photography.",
    },
    joined: "2025-08",
    messageCount: 97,
    helpfulCount: 6,
    tone: "fuchsia",
  },
  {
    id: "marta",
    name: "Marta García",
    handle: "marta.garcia",
    city: "Madrid",
    country: "ES",
    languages: ["es", "en"],
    presence: "online",
    role: "mentor",
    trainings: ["foundations", "advanced", "business"],
    bio: {
      fr: "Studio à Malasaña, deux employées. J’adore aider à fixer ses prix sans se brader.",
      en: "Studio in Malasaña, two employees. Love helping people price without underselling.",
    },
    joined: "2025-02",
    messageCount: 934,
    helpfulCount: 151,
    tone: "emerald",
  },
  {
    id: "lucia",
    name: "Lucía Romero",
    handle: "lucia.romero",
    city: "Valencia",
    country: "ES",
    languages: ["es"],
    presence: "away",
    trainings: ["foundations"],
    bio: {
      fr: "Je commence ! Formation Fondamentaux terminée en septembre.",
      en: "Just starting out! Finished the Foundations course in September.",
    },
    joined: "2025-09",
    messageCount: 41,
    helpfulCount: 2,
    tone: "blue",
  },
  {
    id: "javier",
    name: "Javier Ortega",
    handle: "javier.ortega",
    city: "Sevilla",
    country: "ES",
    languages: ["es"],
    presence: "offline",
    trainings: ["foundations", "hygiene"],
    bio: {
      fr: "Tatoueur, j’ajoute les tooth gems à mon studio. Précis, un peu maniaque.",
      en: "Tattoo artist adding tooth gems to my studio. Precise, slightly obsessive.",
    },
    joined: "2025-05",
    messageCount: 173,
    helpfulCount: 21,
    tone: "ink",
  },
  {
    id: "jonas",
    name: "Jonas Becker",
    handle: "jonas.becker",
    city: "Berlin",
    country: "DE",
    languages: ["de", "en"],
    presence: "online",
    trainings: ["foundations", "advanced"],
    bio: {
      fr: "Studio à Kreuzberg. Spécialiste des pierres colorées et des petites constellations.",
      en: "Studio in Kreuzberg. Coloured stones and tiny constellations are my thing.",
    },
    joined: "2025-03",
    messageCount: 520,
    helpfulCount: 48,
    tone: "blue",
  },
  {
    id: "lea",
    name: "Lea Hoffmann",
    handle: "lea.hoffmann",
    city: "Wien",
    country: "AT",
    languages: ["de"],
    presence: "offline",
    role: "new",
    trainings: ["foundations"],
    bio: {
      fr: "Nouvelle dans le métier, je pose en cabine dans un institut de Vienne.",
      en: "New to the craft, working from a treatment room in a Vienna beauty institute.",
    },
    joined: "2025-09",
    messageCount: 12,
    helpfulCount: 0,
    tone: "emerald",
  },
  {
    id: "priya",
    name: "Priya Shah",
    handle: "priya.shah",
    city: "Dublin",
    country: "IE",
    languages: ["en"],
    presence: "online",
    trainings: ["foundations", "business"],
    bio: {
      fr: "Je travaille en mobile à Dublin et alentours. Grande fan des systèmes de réservation bien huilés.",
      en: "Mobile artist around Dublin. Big fan of booking systems that just work.",
    },
    joined: "2025-05",
    messageCount: 344,
    helpfulCount: 37,
    tone: "fuchsia",
  },
  {
    id: "olivia",
    name: "Olivia Brooks",
    handle: "olivia.brooks",
    city: "Brighton",
    country: "GB",
    languages: ["en"],
    presence: "offline",
    role: "new",
    trainings: ["foundations"],
    bio: {
      fr: "Je viens de terminer ma première formation, j’ouvre mes rendez-vous en novembre.",
      en: "Just finished my first course, opening bookings in November.",
    },
    joined: "2025-10",
    messageCount: 8,
    helpfulCount: 0,
    tone: "blue",
  },
  {
    id: "noah",
    name: "Noah Petit",
    handle: "noah.petit",
    city: "Bruxelles",
    country: "BE",
    languages: ["fr", "en"],
    presence: "online",
    role: "new",
    trainings: ["foundations"],
    bio: {
      fr: "Bruxelles, tout juste formé. Je pose surtout sur des amis pour l’instant.",
      en: "Brussels, freshly trained. Mostly setting gems on friends for now.",
    },
    joined: "2025-09",
    messageCount: 23,
    helpfulCount: 1,
    tone: "emerald",
  },
  {
    id: "aylin",
    name: "Aylin Kaya",
    handle: "aylin.kaya",
    city: "Köln",
    country: "DE",
    languages: ["de", "en"],
    presence: "away",
    trainings: ["foundations", "advanced", "business"],
    bio: {
      fr: "Cologne, studio partagé avec une tatoueuse. Je parle chiffres et fidélisation volontiers.",
      en: "Cologne, sharing a studio with a tattoo artist. Happy to talk numbers and client retention.",
    },
    joined: "2025-02",
    messageCount: 701,
    helpfulCount: 88,
    tone: "fuchsia",
  },
];

const MEMBER_INDEX = new Map(CHAT_MEMBERS.map((member) => [member.id, member]));

export function getChatMember(id: string): ChatMember | undefined {
  return MEMBER_INDEX.get(id);
}

/* ---------------------------------------------------------------- messages */

/** Reactions available in the lounge, in display order. */
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
  src: string;
  name: string;
  /** Written by the author, as they would caption the photo. */
  alt: string;
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
  /** Reactions the viewer had already added before this session. */
  mine?: ChatReaction[];
  attachments?: ChatAttachment[];
  /** Epoch milliseconds, for messages written during the session (`minutesAgo` is then 0). */
  sentAt?: number;
}

/** A mention inside a `say` template. */
const at = (memberId: string) => ({ memberId });

/** Message text with mentions: say`Thanks ${at("emma")}!` */
function say(strings: TemplateStringsArray, ...mentions: Array<{ memberId: string }>): MessagePart[] {
  const parts: MessagePart[] = [];
  strings.forEach((text, index) => {
    if (text) parts.push({ type: "text", text });
    const mention = mentions[index];
    if (mention) parts.push({ type: "mention", memberId: mention.memberId });
  });
  return parts;
}

function msg(
  id: string,
  authorId: string,
  minutesAgo: number,
  parts: MessagePart[],
  extra: Omit<ChatMessage, "id" | "authorId" | "minutesAgo" | "parts"> = {},
): ChatMessage {
  return { id, authorId, minutesAgo, parts, ...extra };
}

function image(file: string, alt: string): ChatAttachment {
  return { kind: "image", src: photo(file), name: file, alt };
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
  /** Members of this lounge, beyond the ones the fixtures name. */
  memberCount: number;
  /** Named members who hang out in this lounge. */
  memberIds: string[];
  channels: ChatChannel[];
}

function channel(
  server: ServerId,
  key: ChannelKey,
  name: string,
  topic: string,
  messages: ChatMessage[],
  unread = 0,
): ChatChannel {
  return { id: `${server}-${key}`, key, name, topic, unread, messages };
}

const H = 60;
const D = 24 * H;

/* ------------------------------------------------------- English lounge */

const EN_CHANNELS: ChatChannel[] = [
  channel("en", "introductions", "Introductions", "New here? Say hello, tell us where you work and what you love setting.", [
    msg("en-in-1", "priya", 3 * D + 140, say`Hi everyone! Priya, mobile artist around Dublin. Finished Business Essentials last month and it changed how I book clients. Happy to be here 💜`, { reactions: { heart: 9, sparkles: 3 } }),
    msg("en-in-2", "camille", 3 * D + 120, say`Welcome ${at("priya")}! Mobile setups are a topic on their own — #techniques has a great thread on travel kits.`, { replyToId: "en-in-1", reactions: { heart: 2 } }),
    msg("en-in-3", "olivia", D + 6 * H, say`Hello from Brighton 👋 I'm Olivia, just finished Foundations and opening bookings in November. A bit nervous, mostly excited!`, { reactions: { heart: 12, clap: 6 }, mine: ["heart"] }),
    msg("en-in-4", "emma", D + 5 * H + 40, say`Welcome Olivia! Nervous is normal. Practise on typodonts until the etching timing is boring — then it's just you and the client.`, { replyToId: "en-in-3", reactions: { heart: 4, sparkles: 2 } }),
    msg("en-in-5", "noah", 50, say`Hey all, Noah from Brussels. Mostly hanging out in the French lounge but I read everything here too 🙂`, { reactions: { clap: 3 } }),
  ], 1),

  channel("en", "general", "General Discussion", "Everyday questions, wins of the week and anything that doesn't fit elsewhere.", [
    msg("en-g-1", "emma", 2 * D + 200, say`Morning all ☕ Who's setting today? I've got four clients and a Swarovski delivery that's somehow lost in Leeds.`, { reactions: { laugh: 5 } }),
    msg("en-g-2", "sarah", 2 * D + 180, say`Three today! Two first-timers, both bringing friends for "moral support" 😅`, { replyToId: "en-g-1", reactions: { laugh: 4 } }),
    msg("en-g-3", "jonas", D + 3 * H, say`Small win: a client came back after eight months and her gem is still perfect. Proper isolation really is everything.`, { reactions: { fire: 7, clap: 5, heart: 2 } }),
    msg("en-g-4", "camille", D + 2 * H + 30, say`That's the best advert there is ${at("jonas")} — eight months of a client smiling at people.`, { replyToId: "en-g-3", reactions: { heart: 3 } }),
    msg("en-g-5", "aylin", 6 * H, say`Does anyone else find Mondays are all enquiries and no bookings? My DMs are full of "how much" with no follow-up.`),
    msg("en-g-6", "priya", 5 * H + 40, say`Every single week. A price list pinned to your profile cuts it by half — then the ones who message are ready to book.`, { replyToId: "en-g-5", reactions: { clap: 4 } }),
    msg("en-g-7", "olivia", 70, say`Quick one: is it okay to set on someone who just had a scale and polish yesterday?`),
    msg("en-g-8", "emma", 42, say`I'd give it a few days ${at("olivia")} — gums can be a bit tender after a clean. ${at("camille")} is that what the course recommends?`, { replyToId: "en-g-7", reactions: { sparkles: 2 } }),
    msg("en-g-9", "priya", 12, say`${at("you")} you asked about travel kits last week — I finally wrote up my list, it's pinned in #techniques 💼`, { reactions: { heart: 1 } }),
  ], 3),

  channel("en", "inspiration", "Inspiration", "Your work, references, colour ideas. One photo, one line about your intention.", [
    msg("en-i-1", "sarah", 2 * D + 30, say`Chrome heart + tiny opal on the lateral. Wanted it to read as one shape from across the room.`, { attachments: [image("mouth-02.jpg", "Chrome heart and small opal on an upper lateral incisor")], reactions: { fire: 14, heart: 9, sparkles: 4 }, mine: ["fire"] }),
    msg("en-i-2", "emma", 2 * D + 10, say`The negative space between them is so good. Sold.`, { replyToId: "en-i-1", reactions: { heart: 2 } }),
    msg("en-i-3", "jonas", D + 4 * H, say`Constellation on the canine — three crystals, three sizes. Client brought a sketch of Orion 🌌`, { attachments: [image("mouth-04.jpg", "Three crystals of different sizes set as a small constellation on a canine")], reactions: { sparkles: 18, heart: 7, gem: 5 } }),
    msg("en-i-4", "olivia", D + 3 * H, say`This is exactly the kind of thing I want to do. How do you plan the spacing?`, { replyToId: "en-i-3" }),
    msg("en-i-5", "jonas", D + 2 * H + 20, say`I mark it on a photo first, then hold each stone with wax before etching. If it doesn't look right in the photo it won't look right on the tooth.`, { replyToId: "en-i-4", reactions: { clap: 6, sparkles: 2 } }),
    msg("en-i-6", "priya", 3 * H, say`Moodboard for an autumn mini-collection: amber, smoky topaz, a single gold leaf. Thoughts?`, { attachments: [image("img-07.jpg", "Autumn moodboard with amber and gold tones")], reactions: { heart: 5 } }),
  ], 2),

  channel("en", "techniques", "Techniques & Tips", "Etching, bonding, isolation, curing, tools and troubleshooting. Questions welcome at every level.", [
    msg("en-t-1", CHAT_VIEWER_ID, 3 * D, say`What's in your mobile kit? I keep forgetting something different every time I travel.`, { reactions: { heart: 3, clap: 2 } }),
    msg("en-t-2", "emma", 3 * D - 30, say`Laminated checklist taped inside the case lid. Retractors, cotton rolls, wedges, etch, bond, composite, curing light + spare battery, wax stick, mirror. Ticked at home and at the client's.`, { replyToId: "en-t-1", reactions: { sparkles: 11, clap: 8 }, mine: ["sparkles"] }),
    msg("en-t-3", "jonas", 2 * D + 4 * H, say`Has anyone tried placing smaller gems (1.8 mm) on lower teeth? Saliva control there is a different sport.`),
    msg("en-t-4", "sarah", 2 * D + 3 * H + 30, say`Yes — dry angles plus a tongue guard. And I only go for lowers on clients I've already worked with; they know how to stay still.`, { replyToId: "en-t-3", reactions: { clap: 6 } }),
    msg("en-t-5", "camille", 2 * D + 3 * H, say`Adding to ${at("sarah")}: shorten everything. Etch, rinse, dry, bond — no pauses between steps on lowers. The window is smaller than on uppers.`, { replyToId: "en-t-3", reactions: { sparkles: 9, gem: 3 } }),
    msg("en-t-6", "aylin", 9 * H, say`My curing light seems weaker than it used to be. Is there a simple way to check it?`),
    msg("en-t-7", "emma", 8 * H + 15, say`A radiometer is cheap and worth it. Also clean the tip — composite build-up on the lens is the usual culprit.`, { replyToId: "en-t-6", reactions: { clap: 3 } }),
    msg("en-t-8", "priya", 25, say`As promised, my travel kit list 👇 Two cases: one "clinical" (everything that touches the client, sealed) and one "studio" (light, ring light, pillow, mirror). Never mix them.`, { reactions: { heart: 4, sparkles: 2 } }),
  ], 2),

  channel("en", "business", "Business & Growth", "Pricing, bookings, marketing, client care — the craft beyond the set.", [
    msg("en-b-1", "aylin", 2 * D + 2 * H, say`Real talk: how did you set your first prices? I'm sitting at €45 for a single crystal and everyone says that's too low.`),
    msg("en-b-2", "marta", 2 * D + H + 30, say`Work backwards: materials + time (including setup and cleaning) + what you want to earn per hour. For most people that lands well above €45.`, { replyToId: "en-b-1", reactions: { clap: 12, fire: 3 } }),
    msg("en-b-3", "priya", 2 * D + H, say`And take a deposit. Mine is €20, deducted from the price. No-shows went from 3 a month to basically zero.`, { replyToId: "en-b-1", reactions: { clap: 8, sparkles: 2 } }),
    msg("en-b-4", "lucas", D + 5 * H, say`What do you all post on Instagram besides the result photo? I feel like I'm repeating myself.`),
    msg("en-b-5", "emma", D + 4 * H, say`The process (hands only, no client face), the aftercare explained, and the "why" of each design. People book you for your taste, not just for a gem.`, { replyToId: "en-b-4", reactions: { heart: 6, clap: 4 } }),
    msg("en-b-6", "marta", 4 * H, say`Tiny tip: send an aftercare message 24 h later. Clients feel looked after — and half of them reply with a selfie you can ask to repost.`, { reactions: { fire: 6, heart: 3 } }),
  ]),
];

/* ------------------------------------------------------- French lounge */

const FR_CHANNELS: ChatChannel[] = [
  channel("fr", "introductions", "Présentations", "Nouvelle ou nouveau ici ? Dites bonjour, où vous travaillez et ce que vous aimez poser.", [
    msg("fr-in-1", "ines", 4 * D, say`Bonjour à toutes et à tous ! Inès, prothésiste ongulaire à Marseille. J’ajoute les tooth gems à ma carte après la formation Fondamentaux ✨`, { reactions: { heart: 8, sparkles: 2 } }),
    msg("fr-in-2", "camille", 4 * D - 40, say`Bienvenue ${at("ines")} ! Beaucoup de prothésistes nous rejoignent, vous avez déjà la précision et la clientèle 💅`, { replyToId: "fr-in-1", reactions: { heart: 3 } }),
    msg("fr-in-3", "noah", 2 * D, say`Salut ! Noah, Bruxelles. Formé le mois dernier, je pose surtout sur des amis pour l’instant. Ravi d’être là.`, { reactions: { clap: 5, heart: 4 } }),
    msg("fr-in-4", "lucas", 2 * D - 60, say`Bienvenue Noah ! Les amis, c’est le meilleur entraînement : ils te disent franchement quand c’est trop haut 😄`, { replyToId: "fr-in-3", reactions: { laugh: 6 } }),
  ]),

  channel("fr", "general", "Discussion générale", "Questions du quotidien, petites victoires et tout le reste.", [
    msg("fr-g-1", "lucas", 2 * D + 3 * H, say`Qui est au salon pro de Lyon le mois prochain ? On pourrait se retrouver autour d’un café.`, { reactions: { heart: 4 } }),
    msg("fr-g-2", "ines", 2 * D + 2 * H, say`Moi ! Le samedi seulement. On fait une photo de groupe Global Toothgems ? 📸`, { replyToId: "fr-g-1", reactions: { heart: 3, sparkles: 2 } }),
    msg("fr-g-3", "camille", D + 6 * H, say`L’équipe sera sur place les deux jours, passez nous voir au stand. On aura les nouvelles formes en avant-première.`, { replyToId: "fr-g-1", reactions: { fire: 8, gem: 4 } }),
    msg("fr-g-4", "noah", 5 * H, say`Question bête : vous mettez de la musique pendant la pose ? J’ai l’impression que ça détend tout le monde, moi compris.`),
    msg("fr-g-5", "ines", 4 * H + 20, say`Pas bête du tout ! Playlist douce, volume bas. Et je préviens avant chaque étape, ça rassure plus que la musique.`, { replyToId: "fr-g-4", reactions: { clap: 3 } }),
    msg("fr-g-6", "emma", 90, say`Petite victoire : ma première cliente en français aujourd’hui, tout s’est bien passé 🎉 Merci ${at("lucas")} pour le vocabulaire !`, { reactions: { heart: 7, clap: 4 } }),
  ], 2),

  channel("fr", "inspiration", "Inspiration", "Vos réalisations, vos références, vos idées couleur.", [
    msg("fr-i-1", "ines", 3 * D, say`Petit cœur doré sur l’incisive latérale, assorti au vernis de la cliente. Elle est repartie ravie.`, { attachments: [image("mouth-01.jpg", "Petit cœur doré posé sur une incisive latérale")], reactions: { heart: 11, sparkles: 5 } }),
    msg("fr-i-2", "camille", 3 * D - 30, say`Assortir au vernis, c’est une super idée de service croisé ${at("ines")} !`, { replyToId: "fr-i-1", reactions: { heart: 2 } }),
    msg("fr-i-3", "sophie", D + 2 * H, say`Duo cristal + opale bleue, très discret. Pour une cliente qui travaille en banque et voulait « quelque chose de secret ».`, { attachments: [image("mouth-03.jpg", "Cristal et opale bleue posés côte à côte, très discrets")], reactions: { sparkles: 9, gem: 6 }, mine: ["gem"] }),
  ], 1),

  channel("fr", "techniques", "Techniques & astuces", "Mordançage, collage, isolation, photopolymérisation, outils et dépannage.", [
    msg("fr-t-1", "noah", 2 * D + 5 * H, say`Ma pierre a sauté au bout de deux semaines. J’ai respecté les temps… qu’est-ce qui a pu se passer ?`),
    msg("fr-t-2", "sophie", 2 * D + 4 * H, say`Le plus souvent : de l’humidité au moment du collage. Tu utilises un écarteur et des rouleaux ? Et tu sèches combien de temps après le rinçage ?`, { replyToId: "fr-t-1", reactions: { clap: 5 } }),
    msg("fr-t-3", "noah", 2 * D + 3 * H + 40, say`Écarteur oui, rouleaux non… je crois que j’ai trouvé 😅`, { replyToId: "fr-t-2", reactions: { laugh: 4, heart: 2 } }),
    msg("fr-t-4", "camille", 2 * D + 3 * H, say`Classique, et c’est comme ça qu’on apprend. Le module 4 de la formation a une vidéo sur l’isolation, revois-la avant ta prochaine pose.`, { replyToId: "fr-t-1", reactions: { sparkles: 6 } }),
    msg("fr-t-5", "lucas", 7 * H, say`Vous rangez vos cristaux comment ? Les petites boîtes à compartiments me rendent fou.`),
    msg("fr-t-6", "camille", 35, say`${at("you")} tu demandais des conseils pour le rangement : une plaque magnétique et des cristaux à dos métallique, ça change la vie. Je mets une photo demain.`, { reactions: { heart: 2 } }),
  ], 2),

  channel("fr", "business", "Business & développement", "Tarifs, réservations, marketing et relation client.", [
    msg("fr-b-1", "lucas", 3 * D, say`Vous proposez des cartes cadeaux ? Décembre approche et on me demande déjà.`),
    msg("fr-b-2", "camille", 3 * D - 50, say`Oui, et pensez à indiquer une durée de validité claire et les conditions sur la carte elle-même.`, { replyToId: "fr-b-1", reactions: { clap: 4 } }),
    msg("fr-b-3", "ines", D + 3 * H, say`J’ai augmenté mes prix de 15 % en septembre en prévenant un mois avant. Aucune cliente perdue, je regrette de ne pas l’avoir fait plus tôt.`, { reactions: { fire: 9, clap: 6 } }),
  ]),
];

/* -------------------------------------------------------- German lounge */

const DE_CHANNELS: ChatChannel[] = [
  channel("de", "introductions", "Vorstellungsrunde", "Neu hier? Sag Hallo und erzähl, wo du arbeitest.", [
    msg("de-in-1", "lea", D + 4 * H, say`Hallo zusammen! Lea aus Wien, ganz frisch dabei. Ich arbeite in einem Kosmetikinstitut und freue mich auf den Austausch.`, { reactions: { heart: 7, clap: 3 } }),
    msg("de-in-2", "sophie", D + 3 * H, say`Willkommen ${at("lea")}! Wien ist eine schöne Stadt für Tooth Gems, frag einfach drauflos.`, { replyToId: "de-in-1", reactions: { heart: 2 } }),
  ]),

  channel("de", "general", "Allgemeine Diskussion", "Fragen aus dem Alltag und alles andere.", [
    msg("de-g-1", "jonas", 2 * D, say`Wer arbeitet hier eigentlich mit Terminbuchung online und wer noch per Telefon?`),
    msg("de-g-2", "aylin", 2 * D - 40, say`Nur online, mit Anzahlung. Telefon hat mich zu viel Zeit gekostet.`, { replyToId: "de-g-1", reactions: { clap: 4 } }),
    msg("de-g-3", "sarah", D + 2 * H, say`Bei mir 50/50. Ältere Kundinnen rufen lieber an, und das ist auch okay.`, { replyToId: "de-g-1", reactions: { heart: 3 } }),
    msg("de-g-4", "jonas", 80, say`${at("sarah")} kommst du nächste Woche zum Stammtisch in Hamburg? Ich bin zufällig in der Stadt.`),
  ], 1),

  channel("de", "inspiration", "Inspiration", "Eure Arbeiten, Referenzen und Farbideen.", [
    msg("de-i-1", "jonas", D + 6 * H, say`Kleine Sternenreihe in Saphirblau. Die Kundin wollte etwas, das man erst auf den zweiten Blick sieht.`, { attachments: [image("mouth-05.jpg", "Kleine Reihe saphirblauer Steine auf einem Schneidezahn")], reactions: { sparkles: 10, gem: 5 } }),
    msg("de-i-2", "sarah", D + 5 * H, say`Wunderschön, und die Abstände sind perfekt.`, { replyToId: "de-i-1", reactions: { heart: 2 } }),
  ]),

  channel("de", "techniques", "Techniken & Tipps", "Ätzen, Bonden, Trockenlegung, Lichthärtung und Fehlersuche.", [
    msg("de-t-1", "lea", 6 * H, say`Wie lange härtet ihr pro Stein aus? In meinen Notizen stehen zwei verschiedene Zeiten.`),
    msg("de-t-2", "sophie", 5 * H + 30, say`Immer nach Herstellerangabe deiner Lampe und deines Komposits. Im Kurs gibt es dazu eine Tabelle im Modul 3.`, { replyToId: "de-t-1", reactions: { clap: 5, sparkles: 2 } }),
    msg("de-t-3", "aylin", 30, say`Und von mehreren Seiten härten, gerade bei größeren Steinen. Das hat bei mir den Unterschied gemacht.`, { replyToId: "de-t-1", reactions: { sparkles: 1 } }),
  ], 1),

  channel("de", "business", "Business & Wachstum", "Preise, Marketing und Kundenbindung.", [
    msg("de-b-1", "aylin", 3 * D, say`Ich habe ein kleines Treueprogramm eingeführt: beim dritten Besuch ein Mini-Kristall gratis. Die Wiederkehrrate ist deutlich gestiegen.`, { reactions: { fire: 6, clap: 5 } }),
    msg("de-b-2", "sarah", 3 * D - 60, say`Gute Idee! Wie trackst du das, auf Papier oder digital?`, { replyToId: "de-b-1" }),
  ]),
];

/* ------------------------------------------------------- Spanish lounge */

const ES_CHANNELS: ChatChannel[] = [
  channel("es", "introductions", "Presentaciones", "¿Eres nueva o nuevo? Saluda y cuéntanos dónde trabajas.", [
    msg("es-in-1", "lucia", 2 * D, say`¡Hola a todas y todos! Soy Lucía, de Valencia. Terminé la formación Fundamentos en septiembre y estoy deseando aprender de vosotras.`, { reactions: { heart: 6, clap: 2 } }),
    msg("es-in-2", "marta", 2 * D - 30, say`¡Bienvenida ${at("lucia")}! Aquí nadie empezó sabiendo, pregunta lo que necesites 💚`, { replyToId: "es-in-1", reactions: { heart: 3 } }),
  ]),

  channel("es", "general", "Conversación general", "Preguntas del día a día y todo lo demás.", [
    msg("es-g-1", "javier", D + 5 * H, say`¿Alguien más combina tooth gems con tatuaje en el mismo estudio? Busco ideas para separar bien los espacios.`),
    msg("es-g-2", "marta", D + 4 * H, say`Yo tengo una cabina aparte, aunque sea pequeña. Para la clienta también es más tranquilo.`, { replyToId: "es-g-1", reactions: { clap: 3 } }),
    msg("es-g-3", "camille", 3 * H, say`Buena pregunta ${at("javier")}: separar zona limpia y zona de trabajo es la base, y la formación de higiene tiene una checklist para eso.`, { replyToId: "es-g-1", reactions: { sparkles: 4 } }),
  ], 1),

  channel("es", "inspiration", "Inspiración", "Vuestros trabajos, referencias e ideas de color.", [
    msg("es-i-1", "marta", D + 2 * H, say`Mariposa de oro con dos cristales rosa. Para una novia, día antes de la boda 💍`, { attachments: [image("img-12.jpg", "Pequeña mariposa dorada con dos cristales rosa")], reactions: { heart: 13, sparkles: 6 } }),
  ]),

  channel("es", "techniques", "Técnicas y consejos", "Grabado, adhesión, aislamiento, fotopolimerización y dudas técnicas.", [
    msg("es-t-1", "lucia", 4 * H, say`¿Qué separador de mejillas usáis? El mío es incómodo para las clientas con boca pequeña.`),
    msg("es-t-2", "marta", 3 * H + 20, say`Ten dos tallas siempre. Y pregunta antes de colocarlo, se nota mucho la diferencia en confianza.`, { replyToId: "es-t-1", reactions: { clap: 2 } }),
  ], 1),

  /* Left empty on purpose: the empty state is part of the experience. */
  channel("es", "business", "Negocio y crecimiento", "Precios, reservas, marketing y fidelización.", []),
];

export const CHAT_SERVERS: ChatServer[] = [
  {
    id: "en",
    name: "English",
    memberCount: 1284,
    memberIds: ["emma", "camille", "sarah", "jonas", "priya", "aylin", "marta", "lucas", "olivia", "noah"],
    channels: EN_CHANNELS,
  },
  {
    id: "fr",
    name: "Français",
    memberCount: 846,
    memberIds: ["camille", "ines", "lucas", "noah", "emma", "sophie"],
    channels: FR_CHANNELS,
  },
  {
    id: "de",
    name: "Deutsch",
    memberCount: 312,
    memberIds: ["sarah", "jonas", "aylin", "sophie", "lea", "camille"],
    channels: DE_CHANNELS,
  },
  {
    id: "es",
    name: "Español",
    memberCount: 207,
    memberIds: ["marta", "camille", "lucia", "javier", "emma"],
    channels: ES_CHANNELS,
  },
];

export const DEFAULT_SERVER: ServerId = "en";

/* ------------------------------------------------------ direct messages */

export interface DirectConversation {
  /** `dm-<memberId>`: one conversation per member pair. */
  id: string;
  memberId: string;
  unread: number;
  messages: ChatMessage[];
}

export function directConversationId(memberId: string): string {
  return `dm-${memberId}`;
}

export const DIRECT_CONVERSATIONS: DirectConversation[] = [
  {
    id: directConversationId("emma"),
    memberId: "emma",
    unread: 2,
    messages: [
      msg("dm-emma-1", CHAT_VIEWER_ID, D + 3 * H, say`Hi Emma! Loved your answer on travel kits. Do you have a brand of cheek retractor you'd recommend?`),
      msg("dm-emma-2", "emma", D + 2 * H, say`Hey! I use the soft silicone ones, two sizes. The rigid ones are cheaper but clients hate them after ten minutes.`, { replyToId: "dm-emma-1" }),
      msg("dm-emma-3", CHAT_VIEWER_ID, D + 2 * H - 20, say`Perfect, ordering both sizes then. Thank you 🙏`, { reactions: { heart: 1 } }),
      msg("dm-emma-4", "emma", 18, say`By the way — a few of us are doing a video call on Thursday about pricing. Want to join?`),
      msg("dm-emma-5", "emma", 17, say`No pressure at all, it's very relaxed 🙂`),
    ],
  },
  {
    id: directConversationId("lucas"),
    memberId: "lucas",
    unread: 1,
    messages: [
      msg("dm-lucas-1", "lucas", 2 * D, say`Salut ! Tu poses à Lyon aussi, non ? On pourrait partager une commande de cristaux pour avoir les frais de port offerts.`),
      msg("dm-lucas-2", CHAT_VIEWER_ID, 2 * D - 90, say`Bonne idée ! Je regarde ce qu’il me manque et je te dis.`, { replyToId: "dm-lucas-1" }),
      msg("dm-lucas-3", "lucas", 3 * H, say`J’ai fait la liste, je te l’envoie ce soir 👍`),
    ],
  },
  {
    id: directConversationId("sarah"),
    memberId: "sarah",
    unread: 0,
    messages: [
      msg("dm-sarah-1", CHAT_VIEWER_ID, 4 * D, say`Your chrome heart in #inspiration is stunning. Which size is the opal?`),
      msg("dm-sarah-2", "sarah", 4 * D - 60, say`Thank you!! 2 mm. Anything smaller disappears next to chrome.`, { reactions: { heart: 1 }, mine: ["heart"] }),
    ],
  },
  {
    id: directConversationId("camille"),
    memberId: "camille",
    unread: 0,
    messages: [
      msg("dm-camille-1", "camille", 6 * D, say`Bienvenue dans les salons ! Si tu as la moindre question sur ta formation, écris-moi ici directement.`),
      msg("dm-camille-2", CHAT_VIEWER_ID, 6 * D - 120, say`Merci Camille, c’est très rassurant 😊`, { reactions: { heart: 1 } }),
    ],
  },
];

/**
 * What a member answers when the visitor writes to them, in this prototype
 * only — the typing indicator and an answer show how a live conversation will
 * feel. Nothing like this exists once messages are real.
 */
export const DEMO_AUTO_REPLY: Record<ServerId, string> = {
  en: "Thanks for the message! Let me check and get back to you shortly 🙂",
  fr: "Merci pour ton message ! Je regarde et je te réponds très vite 🙂",
  de: "Danke für deine Nachricht! Ich schaue nach und melde mich gleich 🙂",
  es: "¡Gracias por tu mensaje! Lo miro y te respondo enseguida 🙂",
};

/** Lounges announced but not open yet — the switcher shows the community can grow. */
export const UPCOMING_SERVERS: Array<{ code: "it" | "pt"; name: string }> = [
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
];
