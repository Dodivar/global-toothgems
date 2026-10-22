import { describe, expect, it } from "vitest";
import { SHARE_NETWORKS, networkShareAction } from "./socialShare";

const content = {
  url: "https://example.test/studio-3d/partage/abc?x=1&y=2",
  text: "Ma création & mes gemmes !",
  title: "Studio 3D",
};

const url = (network: Parameters<typeof networkShareAction>[0]) => networkShareAction(network, content).url;

describe("networkShareAction (social share entries)", () => {
  it("points every network at its own share endpoint", () => {
    expect(url("whatsapp")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(url("facebook")).toMatch(/^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
    expect(url("pinterest")).toMatch(/^https:\/\/www\.pinterest\.com\/pin\/create\/link\/\?url=/);
    expect(url("snapchat")).toMatch(/^https:\/\/www\.snapchat\.com\/scan\?attachmentUrl=/);
    expect(url("threads")).toMatch(/^https:\/\/www\.threads\.net\/intent\/post\?text=/);
    expect(url("x")).toMatch(/^https:\/\/x\.com\/intent\/tweet\?/);
    expect(url("linkedin")).toMatch(/^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/);
    expect(url("telegram")).toMatch(/^https:\/\/t\.me\/share\/url\?url=/);
    expect(url("email")).toMatch(/^mailto:\?subject=/);
  });

  it("carries the read-only link to every network that takes one", () => {
    const params: [Parameters<typeof url>[0], string][] = [
      ["facebook", "u"],
      ["pinterest", "url"],
      ["snapchat", "attachmentUrl"],
      ["x", "url"],
      ["linkedin", "url"],
      ["telegram", "url"],
    ];
    for (const [network, key] of params) expect(new URL(url(network)).searchParams.get(key)).toBe(content.url);
    expect(new URL(url("whatsapp")).searchParams.get("text")).toBe(`${content.text} ${content.url}`);
    expect(new URL(url("threads")).searchParams.get("text")).toBe(`${content.text} ${content.url}`);
    expect(new URL(url("x")).searchParams.get("text")).toBe(content.text);
    expect(new URL(url("pinterest")).searchParams.get("description")).toBe(content.text);
  });

  it("copies the link for the networks that take none from a website", () => {
    expect(networkShareAction("instagram", content)).toEqual({ kind: "copyThenOpen", url: "https://www.instagram.com/" });
    expect(networkShareAction("tiktok", content)).toEqual({ kind: "copyThenOpen", url: "https://www.tiktok.com/" });
    expect(networkShareAction("facebook", content).kind).toBe("open");
    expect(networkShareAction("email", content).kind).toBe("mail");
  });

  it("puts the message and the page in the e-mail body", () => {
    const link = url("email");
    expect(decodeURIComponent(link.split("body=")[1])).toBe(`${content.text}\n\n${content.url}`);
    expect(decodeURIComponent(link.split("subject=")[1].split("&")[0])).toBe(content.title);
  });

  it("lists each network once", () => {
    expect(new Set(SHARE_NETWORKS).size).toBe(SHARE_NETWORKS.length);
  });
});
