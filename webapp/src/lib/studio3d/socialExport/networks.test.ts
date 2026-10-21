import { describe, expect, it } from "vitest";
import { NETWORKS, SOCIAL_NETWORKS, desktopAction, fileFits, isSocialNetwork, linkShareUrl, recommendedFormat } from "./networks";
import { sharePreviewMetadata } from "../../studioWorkspace/sharePreview";

const link = { url: "https://example.test/studio-3d/partage/abc?x=1&y=2", text: "Ma création & mes gemmes ! #toothgems", imageUrl: "https://cdn.test/r.jpg?token=a&b=c" };

describe("social networks", () => {
  it("lists the eight networks, each with an https create page", () => {
    expect(SOCIAL_NETWORKS).toHaveLength(8);
    expect(new Set(SOCIAL_NETWORKS).size).toBe(8);
    for (const n of SOCIAL_NETWORKS) expect(NETWORKS[n].uploadUrl).toMatch(/^https:\/\//);
    expect(isSocialNetwork("threads")).toBe(true);
    expect(isSocialNetwork("myspace")).toBe(false);
  });

  it("builds each link intent on the network's own domain, fully encoded", () => {
    const fb = new URL(linkShareUrl("facebook", link)!);
    expect(fb.origin + fb.pathname).toBe("https://www.facebook.com/sharer/sharer.php");
    expect(fb.searchParams.get("u")).toBe(link.url);

    const x = new URL(linkShareUrl("x", link)!);
    expect(x.origin + x.pathname).toBe("https://x.com/intent/post");
    expect(x.searchParams.get("text")).toBe(link.text);
    expect(x.searchParams.get("url")).toBe(link.url);

    const threads = new URL(linkShareUrl("threads", link)!);
    expect(threads.origin + threads.pathname).toBe("https://www.threads.net/intent/post");
    expect(threads.searchParams.get("text")).toBe(`${link.text} ${link.url}`);

    const wa = new URL(linkShareUrl("whatsapp", link)!);
    expect(wa.origin).toBe("https://wa.me");
    expect(wa.searchParams.get("text")).toBe(`${link.text} ${link.url}`);

    const pin = new URL(linkShareUrl("pinterest", link)!);
    expect(pin.origin + pin.pathname).toBe("https://www.pinterest.com/pin/create/button/");
    expect(pin.searchParams.get("url")).toBe(link.url);
    expect(pin.searchParams.get("media")).toBe(link.imageUrl);
    expect(pin.searchParams.get("description")).toBe(link.text);
    // Nothing leaks out of the encoded values into the query.
    expect([...pin.searchParams.keys()]).toEqual(["url", "media", "description"]);
  });

  it("has no link intent for TikTok, Instagram and Snapchat, nor Pinterest without an image", () => {
    for (const n of ["tiktok", "instagram", "snapchat"] as const) expect(linkShareUrl(n, link)).toBeNull();
    expect(linkShareUrl("pinterest", { ...link, imageUrl: null })).toBeNull();
  });

  it("on a computer, shares the public page when it can, else opens the create page", () => {
    expect(desktopAction("facebook", link).kind).toBe("link");
    expect(desktopAction("facebook", null)).toEqual({ kind: "upload", url: "https://www.facebook.com/" });
    expect(desktopAction("tiktok", link)).toEqual({ kind: "upload", url: "https://www.tiktok.com/upload" });
    expect(desktopAction("pinterest", { ...link, imageUrl: null })).toEqual({ kind: "upload", url: "https://www.pinterest.com/pin-builder/" });
  });

  it("recommends a format per network and output", () => {
    expect(recommendedFormat("tiktok", "video")).toBe("story");
    expect(recommendedFormat("snapchat", "image")).toBe("story");
    expect(recommendedFormat("instagram", "image")).toBe("portrait");
    expect(recommendedFormat("instagram", "video")).toBe("story");
    expect(recommendedFormat("facebook", "gif")).toBe("portrait");
    expect(recommendedFormat("whatsapp", "image")).toBe("square");
  });

  it("flags files a network may refuse", () => {
    expect(fileFits("instagram", "video/webm")).toBe(false);
    expect(fileFits("tiktok", "video/webm;codecs=vp9")).toBe(false);
    expect(fileFits("facebook", "video/webm")).toBe(true);
    expect(fileFits("instagram", "image/gif")).toBe(false);
    expect(fileFits("instagram", "video/mp4")).toBe(true);
    expect(fileFits("x", "image/png")).toBe(true);
  });
});

describe("share preview metadata", () => {
  it("gives link previews the creation's name and render", () => {
    const meta = sharePreviewMetadata({ name: " Aurora ", description: "Two crystals", imageUrl: "https://cdn.test/r.jpg", author: "Nova" });
    expect(meta.title).toBe("Aurora · Nova · Global Toothgems");
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.openGraph).toMatchObject({ title: "Aurora · Nova · Global Toothgems", images: [{ url: "https://cdn.test/r.jpg", width: 480, height: 360 }] });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: ["https://cdn.test/r.jpg"] });
  });

  it("falls back to a small card without a render", () => {
    const meta = sharePreviewMetadata({ name: "", description: "", imageUrl: null });
    expect(meta.title).toBe("Global Toothgems");
    expect(meta.description).toBeUndefined();
    expect(meta.twitter).toMatchObject({ card: "summary" });
  });
});
