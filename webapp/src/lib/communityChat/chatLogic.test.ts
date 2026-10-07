import { describe, expect, it } from "vitest";
import { CHAT_MEMBERS, CHAT_SERVERS, type ChatMessage } from "../../data/communityChat";
import {
  activeMentionQuery,
  continuesPrevious,
  insertMention,
  mentionCandidates,
  mentionedMembers,
  parseComposerText,
  plainText,
  reactionsOf,
  roomKey,
  searchCommunity,
  toggleReaction,
} from "./chatLogic";

const nameOf = (id: string) => CHAT_MEMBERS.find((m) => m.id === id)?.name ?? id;
const message = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: "m",
  authorId: "emma",
  minutesAgo: 10,
  parts: [{ type: "text", text: "hello" }],
  ...overrides,
});

describe("reactions", () => {
  it("keeps seeded totals when the viewer did not change anything", () => {
    const m = message({ reactions: { heart: 3, fire: 1 }, mine: ["heart"] });
    expect(reactionsOf(m)).toEqual([
      { reaction: "heart", count: 3, mine: true },
      { reaction: "fire", count: 1, mine: false },
    ]);
  });

  it("removes the viewer from a seeded reaction and drops empty ones", () => {
    const m = message({ reactions: { heart: 1 }, mine: ["heart"] });
    expect(reactionsOf(m, [])).toEqual([]);
  });

  it("adds the viewer to a new reaction", () => {
    const m = message({ reactions: { clap: 2 } });
    expect(reactionsOf(m, ["clap", "gem"])).toEqual([
      { reaction: "clap", count: 3, mine: true },
      { reaction: "gem", count: 1, mine: true },
    ]);
  });

  it("toggles", () => {
    expect(toggleReaction(["heart"], "heart")).toEqual([]);
    expect(toggleReaction(["heart"], "fire")).toEqual(["heart", "fire"]);
  });
});

describe("mentions", () => {
  it("opens on @ at the start or after a space only", () => {
    expect(activeMentionQuery("@em", 3)).toEqual({ query: "em", start: 0 });
    expect(activeMentionQuery("hi @Inè", 7)).toEqual({ query: "Inè", start: 3 });
    expect(activeMentionQuery("mail me@home", 12)).toBeNull();
    expect(activeMentionQuery("@emma done", 10)).toBeNull();
  });

  it("finds members by first name, last name or handle, accents ignored", () => {
    expect(mentionCandidates("ine", CHAT_MEMBERS).map((m) => m.id)).toEqual(["ines"]);
    expect(mentionCandidates("klein", CHAT_MEMBERS).map((m) => m.id)).toEqual(["sarah"]);
    expect(mentionCandidates("camille.gt", CHAT_MEMBERS).map((m) => m.id)).toEqual(["camille"]);
    expect(mentionCandidates("", CHAT_MEMBERS, 3)).toHaveLength(3);
  });

  it("inserts the handle in place of the typed query", () => {
    expect(insertMention("hi @em and", 3, 6, "emma.martin")).toEqual({ text: "hi @emma.martin  and", caret: 16 });
  });

  it("turns known handles into tokens and leaves the rest as text", () => {
    expect(parseComposerText("Thanks @emma.martin. And @nobody, me@mail.com", CHAT_MEMBERS)).toEqual([
      { type: "text", text: "Thanks " },
      { type: "mention", memberId: "emma" },
      { type: "text", text: ". And @nobody, me@mail.com" },
    ]);
  });

  it("writes mentions back as names", () => {
    const parts = parseComposerText("@sarah.klein yes!", CHAT_MEMBERS);
    expect(plainText(parts, nameOf)).toBe("@Sarah Klein yes!");
  });

  it("lists mentioned members, most recent first", () => {
    const messages = [
      message({ id: "a", minutesAgo: 30, parts: [{ type: "mention", memberId: "emma" }] }),
      message({ id: "b", minutesAgo: 5, parts: [{ type: "mention", memberId: "sarah" }, { type: "mention", memberId: "emma" }] }),
    ];
    expect(mentionedMembers(messages)).toEqual(["sarah", "emma"]);
  });
});

describe("timeline", () => {
  const now = new Date(2026, 9, 7, 15, 0).getTime();

  it("groups one author's close messages", () => {
    expect(continuesPrevious(message({ minutesAgo: 20 }), message({ minutesAgo: 16 }), now)).toBe(true);
    expect(continuesPrevious(message({ minutesAgo: 30 }), message({ minutesAgo: 16 }), now)).toBe(false);
    expect(continuesPrevious(message({ minutesAgo: 20, authorId: "sarah" }), message({ minutesAgo: 16 }), now)).toBe(false);
  });

  it("never groups a reply", () => {
    expect(continuesPrevious(message({ minutesAgo: 20 }), message({ minutesAgo: 19, replyToId: "x" }), now)).toBe(false);
  });

  it("never groups across midnight", () => {
    const early = new Date(2026, 9, 7, 0, 2).getTime();
    expect(continuesPrevious(message({ minutesAgo: 5 }), message({ minutesAgo: 1 }), early)).toBe(false);
  });
});

describe("search", () => {
  const en = CHAT_SERVERS[0];
  const scope = {
    rooms: en.channels.map((c) => ({ room: { kind: "channel" as const, channelId: c.id }, label: c.name, messages: c.messages })),
    members: CHAT_MEMBERS,
    channels: en.channels.map((c) => ({ channelId: c.id, name: c.name, topic: c.topic })),
  };

  it("matches every word, accents and case ignored", () => {
    const results = searchCommunity("curing LIGHT", scope, nameOf);
    expect(results.messages.length).toBeGreaterThan(0);
    for (const hit of results.messages) expect(hit.text.toLowerCase()).toContain("curing light");
  });

  it("finds members and channels", () => {
    const results = searchCommunity("techniques", scope, nameOf);
    expect(results.channels.map((c) => c.channelId)).toContain("en-techniques");
    expect(searchCommunity("ines", scope, nameOf).members.map((m) => m.id)).toEqual(["ines"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchCommunity("  ", scope, nameOf)).toEqual({ messages: [], members: [], channels: [] });
  });
});

describe("fixtures", () => {
  it("only reply to messages of the same room and mention known members", () => {
    const ids = new Set(CHAT_MEMBERS.map((m) => m.id).concat("you"));
    for (const server of CHAT_SERVERS) {
      for (const channel of server.channels) {
        const local = new Set(channel.messages.map((m) => m.id));
        for (const m of channel.messages) {
          if (m.replyToId) expect(local.has(m.replyToId), m.id).toBe(true);
          expect(ids.has(m.authorId), m.id).toBe(true);
          for (const part of m.parts) if (part.type === "mention") expect(ids.has(part.memberId), m.id).toBe(true);
        }
        expect(channel.unread).toBeLessThanOrEqual(channel.messages.length);
      }
    }
  });

  it("gives every room a distinct key", () => {
    const keys = CHAT_SERVERS.flatMap((s) => s.channels.map((c) => roomKey({ kind: "channel", channelId: c.id })));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
