import { describe, expect, it } from "vitest";
import { calendarPlatform, googleEventUrl, googleSubscribeUrl, outlookEventUrl, webcalUrl } from "./calendarLinks";

const event = {
  startsAt: "2026-12-20T13:00:00.000Z",
  endsAt: "2026-12-20T14:00:00.000Z",
  summary: "Rendez-vous tooth gems avec Léa",
  description: "Création : Aurora\nhttps://example.com/compte/rendez-vous",
  location: "12 rue de la Paix, Paris",
};

describe("calendar links", () => {
  it("prefills Google Calendar with UTC times", () => {
    const url = new URL(googleEventUrl(event));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261220T130000Z/20261220T140000Z");
    expect(url.searchParams.get("text")).toBe(event.summary);
    expect(url.searchParams.get("details")).toBe(event.description);
    expect(url.searchParams.get("location")).toBe(event.location);
  });

  it("prefills Outlook and leaves out an unknown place", () => {
    const url = new URL(outlookEventUrl({ ...event, location: null }));
    expect(url.hostname).toBe("outlook.live.com");
    expect(url.searchParams.get("startdt")).toBe("2026-12-20T13:00:00Z");
    expect(url.searchParams.get("enddt")).toBe("2026-12-20T14:00:00Z");
    expect(url.searchParams.get("subject")).toBe(event.summary);
    expect(url.searchParams.has("location")).toBe(false);
  });

  it("turns the feed into subscription links", () => {
    const feed = "https://abc.supabase.co/functions/v1/glowbook-calendar-feed?token=xyz";
    expect(webcalUrl(feed)).toBe("webcal://abc.supabase.co/functions/v1/glowbook-calendar-feed?token=xyz");
    const google = new URL(googleSubscribeUrl(feed));
    expect(google.searchParams.get("cid")).toBe(webcalUrl(feed));
  });

  it("recognises the phone's platform", () => {
    expect(calendarPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(calendarPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe("ios");
    expect(calendarPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe("other");
    expect(calendarPlatform("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
  });
});
