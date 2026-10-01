import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isActivePath, resolveAddress, splitTo } from "./href";
import { handOff, stateFor } from "./state";
import type { ParamTranslator } from "../localeRoutes";

describe("resolveAddress", () => {
  const english: ParamTranslator = (id, params, locale) => (id === "product" && locale === "en" ? { id: `${params.id}-en` } : params);

  it("writes a public page's internal path as its address in the language", () => {
    expect(resolveAddress("/boutique", "/fr", "en")).toBe("/en/shop");
    expect(resolveAddress("/boutique?type=gems#grid", "/fr", "fr")).toBe("/fr/boutique?type=gems#grid");
    expect(resolveAddress("/", "/compte", "en")).toBe("/en");
    expect(resolveAddress("/boutique/coeur", "/en", "en", english)).toBe("/en/shop/coeur-en");
  });

  it("leaves private paths alone and keeps a query-only target on the current address", () => {
    expect(resolveAddress("/compte/commandes?page=2", "/fr", "en")).toBe("/compte/commandes?page=2");
    expect(resolveAddress("?vue=campagnes", "/admin/promotions", "fr")).toBe("/admin/promotions?vue=campagnes");
    expect(resolveAddress("#faq-3", "/en/help/faq", "en")).toBe("/en/help/faq#faq-3");
  });

  it("splits a target", () => {
    expect(splitTo("/a?b=1#c")).toEqual({ pathname: "/a", search: "?b=1", hash: "#c" });
    expect(splitTo("/a#c?d")).toEqual({ pathname: "/a", search: "", hash: "#c?d" });
    expect(splitTo("/a?")).toEqual({ pathname: "/a", search: "", hash: "" });
  });
});

describe("isActivePath", () => {
  it("matches the page and, unless `end`, the pages under it", () => {
    expect(isActivePath("/compte", "/compte", true)).toBe(true);
    expect(isActivePath("/compte/commandes", "/compte", true)).toBe(false);
    expect(isActivePath("/compte/commandes", "/compte")).toBe(true);
    expect(isActivePath("/comptes", "/compte")).toBe(false);
    expect(isActivePath("/boutique", "/")).toBe(false);
    expect(isActivePath("/admin/avis/", "/admin/avis?vue=file")).toBe(true);
  });
});

describe("navigation state (handed to the page opened)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is read at the address it was given for only", () => {
    handOff("/connexion", { from: "/compte/securite" });
    expect(stateFor("/connexion")).toEqual({ from: "/compte/securite" });
    expect(stateFor("/connexion?suite=%2Fcompte")).toBeNull();
    expect(stateFor("/inscription")).toBeNull();
  });

  it("is cleared by a navigation carrying none", () => {
    handOff("/connexion", { from: "/panier" });
    handOff("/connexion", undefined);
    expect(stateFor("/connexion")).toBeNull();
  });

  it("reads nothing without storage", () => {
    vi.stubGlobal("window", {
      get sessionStorage(): Storage {
        throw new Error("blocked");
      },
    });
    handOff("/connexion", { from: "/" });
    expect(stateFor("/connexion")).toBeNull();
  });
});
