import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUS_ATTRIBUTE, focusBootScript, isCampaignVisit, isFocusedPage, isFocusPath, rememberFocusVisit } from "./adFocus";

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

describe("the head script that prevents a flash", () => {
  /** Runs the script as the browser would, on a fake address and tab storage; returns whether <html> was marked. */
  function run(pathname: string, search: string, stored: Record<string, string> = {}) {
    const store = new Map(Object.entries(stored));
    const attributes = new Set<string>();
    const sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const document = { documentElement: { setAttribute: (name: string) => void attributes.add(name) } };
    new Function("location", "sessionStorage", "document", "URLSearchParams", focusBootScript())({ pathname, search }, sessionStorage, document, URLSearchParams);
    return { marked: attributes.has(FOCUS_ATTRIBUTE), store };
  }

  it("marks a tagged visit to the Studio pages, in both languages, and remembers it", () => {
    for (const path of ["/fr/studio-3d", "/fr/studio-3d/abonnement", "/en/3d-studio", "/en/3d-studio/subscribe", "/fr/studio-3d/"]) {
      const { marked, store } = run(path, "?utm_source=instagram");
      expect(marked, path).toBe(true);
      expect(store.get("gt-studio-focus")).toBe("1");
    }
    expect(run("/fr/studio-3d", "?fbclid=x").marked).toBe(true);
    expect(run("/en/3d-studio", "?focus=1").marked).toBe(true);
  });

  it("marks a later page of the same tab, and leaves ordinary visits alone", () => {
    expect(run("/fr/studio-3d/abonnement", "", { "gt-studio-focus": "1" }).marked).toBe(true);
    expect(run("/fr/studio-3d", "").marked).toBe(false);
    expect(run("/fr/boutique", "?utm_source=instagram").marked).toBe(false);
    expect(run("/fr/studio-3d/atelier", "?utm_source=instagram").marked).toBe(false);
  });
});
