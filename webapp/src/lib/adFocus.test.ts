import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isCampaignVisit, isFocusedPage, isFocusPath, rememberFocusVisit } from "./adFocus";

describe("focus visits", () => {
  // Vitest runs in Node: a tab's storage is stood in for by a map.
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("recognises campaign links by UTM tags, click ids or the manual switch", () => {
    expect(isCampaignVisit("?utm_source=instagram&utm_medium=paid")).toBe(true);
    expect(isCampaignVisit("?fbclid=abc")).toBe(true);
    expect(isCampaignVisit("?ttclid=abc")).toBe(true);
    expect(isCampaignVisit("?focus=1")).toBe(true);
  });

  it("ignores ordinary visits and empty tags", () => {
    expect(isCampaignVisit("")).toBe(false);
    expect(isCampaignVisit("?q=gems")).toBe(false);
    expect(isCampaignVisit("?utm_source=&fbclid=")).toBe(false);
    expect(isCampaignVisit("?focus=0")).toBe(false);
  });

  it("only applies to the Studio's offer pages", () => {
    expect(isFocusPath("/studio-3d")).toBe(true);
    expect(isFocusPath("/studio-3d/abonnement")).toBe(true);
    expect(isFocusPath("/boutique")).toBe(false);
    expect(isFocusPath("/studio-3d/atelier")).toBe(false);
    expect(isFocusedPage("/boutique", "?utm_source=instagram")).toBe(false);
    expect(isFocusedPage("/studio-3d", "?utm_source=instagram")).toBe(true);
  });

  it("keeps the focus for the tab once a campaign link was seen", () => {
    expect(isFocusedPage("/studio-3d/abonnement", "")).toBe(false);
    rememberFocusVisit();
    expect(isFocusedPage("/studio-3d/abonnement", "")).toBe(true);
    expect(isFocusedPage("/", "")).toBe(false);
  });
});
