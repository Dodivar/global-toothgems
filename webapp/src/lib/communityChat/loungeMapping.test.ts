import { describe, expect, it } from "vitest";
import {
  attachmentPath,
  loungeFailure,
  mapMember,
  mapMessage,
  mapOverview,
  mapParts,
  mapReactions,
  reactionsByOthers,
  toneFor,
  type DirectoryRow,
  type MessageRow,
} from "./loungeMapping";

const row = (overrides: Partial<MessageRow> = {}): MessageRow => ({
  id: "m1",
  channel_id: "en-general",
  conversation_id: null,
  author_id: "u1",
  parts: [{ type: "text", text: "Hello " }, { type: "mention", memberId: "u2" }],
  reply_to_id: null,
  reactions: { heart: 2 },
  created_at: "2026-10-10T10:00:00.000Z",
  lounge_message_attachments: [],
  ...overrides,
});

const member = (overrides: Partial<DirectoryRow> = {}): DirectoryRow => ({
  user_id: "u1",
  display_name: "Emma M.",
  handle: "emma.martin",
  country_code: "fr",
  languages: ["fr", "en", "xx"],
  presence: "online",
  role: "new",
  joined_at: "2026-09-12T08:00:00Z",
  message_count: 12,
  trainings: ["Fondamentaux"],
  active: true,
  ...overrides,
});

describe("message parts", () => {
  it("keeps texts and mentions, drops anything else", () => {
    expect(
      mapParts([
        { type: "text", text: "a" },
        { type: "mention", memberId: "u2" },
        { type: "html", text: "<b>x</b>" },
        { type: "text", text: 3 },
        "plain",
        null,
      ]),
    ).toEqual([
      { type: "text", text: "a" },
      { type: "mention", memberId: "u2" },
    ]);
    expect(mapParts({ type: "text", text: "a" })).toEqual([]);
  });
});

describe("reaction totals", () => {
  it("keeps known reactions with a positive whole count", () => {
    expect(mapReactions({ heart: 2, fire: 0, poop: 4, gem: 1.5, clap: -1, sparkles: 1 })).toEqual({ heart: 2, sparkles: 1 });
    expect(mapReactions({})).toBeUndefined();
    expect(mapReactions(null)).toBeUndefined();
  });

  it("counts other members' reactions only", () => {
    const message = mapMessage(row({ reactions: { heart: 2, fire: 1 } }), ["heart"], () => undefined);
    expect(reactionsByOthers(message)).toBe(2);
  });
});

describe("messages", () => {
  it("maps a row with its time, reply, the viewer's reactions and signed images in order", () => {
    const message = mapMessage(
      row({
        reply_to_id: "m0",
        lounge_message_attachments: [
          { storage_path: "u1/b.jpg", alt_text: "Second", position: 1 },
          { storage_path: "u1/a.jpg", alt_text: "First", position: 0 },
          { storage_path: "u1/unsigned.jpg", alt_text: "", position: 2 },
        ],
      }),
      ["heart"],
      (path) => (path === "u1/unsigned.jpg" ? undefined : `https://signed/${path}`),
    );
    expect(message).toMatchObject({
      id: "m1",
      authorId: "u1",
      sentAt: Date.parse("2026-10-10T10:00:00.000Z"),
      replyToId: "m0",
      reactions: { heart: 2 },
      mine: ["heart"],
    });
    expect(message.attachments?.map((a) => [a.src, a.alt])).toEqual([
      ["https://signed/u1/a.jpg", "First"],
      ["https://signed/u1/b.jpg", "Second"],
    ]);
  });

  it("leaves optional fields out when empty", () => {
    const message = mapMessage(row({ reactions: {} }), [], () => undefined);
    expect(message.mine).toBeUndefined();
    expect(message.attachments).toBeUndefined();
    expect(message.reactions).toBeUndefined();
    expect(message.replyToId).toBeUndefined();
  });
});

describe("members", () => {
  it("maps a directory row, keeping known lounges, presence and role only", () => {
    expect(mapMember(member(), "Member")).toMatchObject({
      id: "u1",
      name: "Emma M.",
      handle: "emma.martin",
      country: "FR",
      languages: ["fr", "en"],
      presence: "online",
      role: "new",
      joined: "2026-09",
      messageCount: 12,
      trainings: ["Fondamentaux"],
    });
    const odd = mapMember(member({ display_name: "  ", presence: "busy", role: "admin", country_code: "" }), "Member");
    expect(odd).toMatchObject({ name: "Member", presence: "offline", role: undefined, country: undefined });
  });

  it("gives a member the same tint everywhere", () => {
    expect(toneFor("abc")).toBe(toneFor("abc"));
    expect(["blue", "emerald", "fuchsia", "ink"]).toContain(toneFor("3f1c2a4e-9b7d-4c2a-8e1f-0a9b8c7d6e5f"));
  });
});

describe("overview", () => {
  it("reads counts and conversations, ignoring malformed entries", () => {
    const overview = mapOverview({
      channels: [
        { id: "en-general", unread: 3, mentions: 1, muted: false },
        { id: "fr-general", unread: -2, mentions: "x", muted: true },
        { unread: 1 },
      ],
      conversations: [
        {
          id: "c1",
          member_id: "u2",
          unread: 1,
          muted: false,
          last: { id: "m9", author_id: "u2", parts: [{ type: "text", text: "Hi" }], created_at: "2026-10-10T09:00:00Z", reactions: {}, attachments: 2 },
        },
        { id: "c2", member_id: "u3", unread: 0, muted: true, last: null },
        { id: "c3" },
      ],
    });
    expect(overview.channels).toEqual([
      { id: "en-general", unread: 3, mentions: 1, muted: false },
      { id: "fr-general", unread: 0, mentions: 0, muted: true },
    ]);
    expect(overview.conversations).toHaveLength(2);
    expect(overview.conversations[0]).toMatchObject({ id: "c1", memberId: "u2", unread: 1, last: { id: "m9", conversation_id: "c1", attachmentCount: 2 } });
    expect(overview.conversations[1].last).toBeUndefined();
    expect(mapOverview(null)).toEqual({ channels: [], conversations: [] });
  });
});

describe("helpers", () => {
  it("stores an image in the member's folder under a fresh name", () => {
    expect(attachmentPath("u1", { name: "Photo.HEIC", type: "image/png" }, "id-1")).toBe("u1/id-1.png");
    expect(attachmentPath("u1", { name: "photo.WEBP", type: "" }, "id-2")).toBe("u1/id-2.webp");
    expect(attachmentPath("u1", { name: "photo", type: "" }, "id-3")).toBe("u1/id-3.jpg");
  });

  it("names what went wrong from the database's codes", () => {
    expect(loungeFailure({ code: "PT429" })).toBe("rateLimited");
    expect(loungeFailure({ code: "42501" })).toBe("forbidden");
    expect(loungeFailure({ code: "22023" })).toBe("failed");
    expect(loungeFailure(null)).toBe("failed");
  });
});
