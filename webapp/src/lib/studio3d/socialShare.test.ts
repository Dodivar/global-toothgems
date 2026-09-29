import { describe, expect, it } from "vitest";
import { SHARE_NETWORKS, networkShareUrl } from "./socialShare";

const content = {
  url: "https://example.test/studio-3d",
  text: "Ma création & mes gemmes !",
  title: "Studio 3D",
};

describe("networkShareUrl (social share URLs)", () => {
  it("points every network at its own share endpoint", () => {
    expect(networkShareUrl("whatsapp", content)).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(networkShareUrl("facebook", content)).toMatch(/^https:\/\/www\.facebook\.com\/sharer\/sharer\.php\?u=/);
    expect(networkShareUrl("x", content)).toMatch(/^https:\/\/x\.com\/intent\/tweet\?/);
    expect(networkShareUrl("linkedin", content)).toMatch(/^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=/);
    expect(networkShareUrl("email", content)).toMatch(/^mailto:\?subject=/);
  });

  it("encodes the page and the message so neither can break the query", () => {
    const x = new URL(networkShareUrl("x", content));
    expect(x.searchParams.get("text")).toBe(content.text);
    expect(x.searchParams.get("url")).toBe(content.url);
    const fb = new URL(networkShareUrl("facebook", content));
    expect(fb.searchParams.get("u")).toBe(content.url);
    const wa = new URL(networkShareUrl("whatsapp", content));
    expect(wa.searchParams.get("text")).toBe(`${content.text} ${content.url}`);
  });

  it("puts the message and the page in the e-mail body", () => {
    const link = networkShareUrl("email", content);
    expect(decodeURIComponent(link.split("body=")[1])).toBe(`${content.text}\n\n${content.url}`);
    expect(decodeURIComponent(link.split("subject=")[1].split("&")[0])).toBe(content.title);
  });

  it("lists each network once", () => {
    expect(new Set(SHARE_NETWORKS).size).toBe(SHARE_NETWORKS.length);
  });
});
