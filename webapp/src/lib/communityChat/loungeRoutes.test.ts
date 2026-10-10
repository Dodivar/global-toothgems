import { describe, expect, it } from "vitest";
import { CHAT_SERVERS } from "../../data/communityChat";
import { DEFAULT_LOUNGE_PATH, isLoungePath, loungePath, parseLoungePath } from "./loungeRoutes";

describe("lounge addresses", () => {
  it("gives every channel of every lounge an address that reads back to it", () => {
    for (const server of CHAT_SERVERS) {
      for (const channel of server.channels) {
        const path = loungePath({ kind: "channel", channelId: channel.id });
        expect(parseLoungePath(path)).toEqual({ kind: "room", room: { kind: "channel", channelId: channel.id }, serverId: server.id });
      }
    }
  });

  it("uses French channel segments and the language code", () => {
    expect(loungePath({ kind: "channel", channelId: "fr-introductions" })).toBe("/compte/salons/fr/presentations");
    expect(loungePath({ kind: "channel", channelId: "en-general" })).toBe("/compte/salons/en/discussion");
    expect(DEFAULT_LOUNGE_PATH).toBe("/compte/salons/en/discussion");
  });

  it("addresses private conversations by member", () => {
    expect(loungePath({ kind: "dm", conversationId: "dm-emma" })).toBe("/compte/salons/messages/emma");
    expect(parseLoungePath("/compte/salons/messages/emma")).toEqual({ kind: "room", room: { kind: "dm", conversationId: "dm-emma" } });
    const uuid = "3f1c2a4e-9b7d-4c2a-8e1f-0a9b8c7d6e5f";
    const room = { kind: "dm" as const, conversationId: `dm-${uuid}` };
    expect(parseLoungePath(loungePath(room))).toEqual({ kind: "room", room });
  });

  /* An unknown member is the lounge's 404, once it knows its members (MembersLounge). */
  it("sends the bare address to the last room, and anything unknown to the 404", () => {
    expect(parseLoungePath("/compte/salons")).toEqual({ kind: "index" });
    expect(parseLoungePath("/compte/salons/")).toEqual({ kind: "index" });
    for (const path of ["/compte/salons/it/discussion", "/compte/salons/en/nope", "/compte/salons/messages/a%20b", "/compte/salons/messages/%E0%A4%A", "/compte/salons/en", "/compte/salons/en/discussion/extra"]) {
      expect(parseLoungePath(path), path).toEqual({ kind: "notFound" });
    }
  });

  it("does not claim neighbouring addresses", () => {
    expect(isLoungePath("/compte/salonsx")).toBe(false);
    expect(isLoungePath("/compte/salons/en/discussion")).toBe(true);
  });
});
