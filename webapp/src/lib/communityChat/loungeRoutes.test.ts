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
  });

  it("sends the bare address to the last room, and anything unknown to the 404", () => {
    expect(parseLoungePath("/compte/salons")).toEqual({ kind: "index" });
    expect(parseLoungePath("/compte/salons/")).toEqual({ kind: "index" });
    for (const path of ["/compte/salons/it/discussion", "/compte/salons/en/nope", "/compte/salons/messages/you", "/compte/salons/messages/ghost", "/compte/salons/en", "/compte/salons/en/discussion/extra"]) {
      expect(parseLoungePath(path), path).toEqual({ kind: "notFound" });
    }
  });

  it("does not claim neighbouring addresses", () => {
    expect(isLoungePath("/compte/salonsx")).toBe(false);
    expect(isLoungePath("/compte/salons/en/discussion")).toBe(true);
  });
});
