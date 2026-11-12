import { afterEach, describe, expect, it, vi } from "vitest";
import { identitiesInclude, isSignInMethod, PENDING_SIGN_IN_TTL_MS, readPendingNote, readSignInMethod, settlePendingSignIn } from "./lastSignInMethod";
import { enabledProvidersFrom } from "./authProviders";

describe("readPendingNote", () => {
  const now = 1_000_000_000_000;

  it("reads a fresh note for Google or Apple", () => {
    expect(readPendingNote(`apple:${now - 60_000}`, now)).toBe("apple");
    expect(readPendingNote(`google:${now - PENDING_SIGN_IN_TTL_MS}`, now)).toBe("google");
  });

  it("refuses an old, future, unknown or malformed note", () => {
    expect(readPendingNote(`apple:${now - PENDING_SIGN_IN_TTL_MS - 1}`, now)).toBeNull();
    expect(readPendingNote(`apple:${now + 1}`, now)).toBeNull();
    expect(readPendingNote(`github:${now}`, now)).toBeNull();
    expect(readPendingNote("apple:soon", now)).toBeNull();
    expect(readPendingNote(null, now)).toBeNull();
  });
});

describe("identitiesInclude", () => {
  it("finds the provider among the session's identities", () => {
    expect(identitiesInclude([{ provider: "email" }, { provider: "apple" }], "apple")).toBe(true);
    expect(identitiesInclude([{ provider: "email" }], "google")).toBe(false);
    expect(identitiesInclude(undefined, "google")).toBe(false);
  });
});

describe("isSignInMethod", () => {
  it("accepts only the known methods", () => {
    expect(isSignInMethod("email")).toBe(true);
    expect(isSignInMethod("apple")).toBe(true);
    expect(isSignInMethod("github")).toBe(false);
    expect(isSignInMethod(null)).toBe(false);
  });
});

describe("enabledProvidersFrom", () => {
  it("reads the providers switched on in the Auth settings", () => {
    expect([...enabledProvidersFrom({ external: { google: true, apple: false, email: true } })]).toEqual(["google"]);
    expect([...enabledProvidersFrom({ external: { google: true, apple: true } })]).toEqual(["google", "apple"]);
  });

  it("treats anything unexpected as off", () => {
    expect(enabledProvidersFrom(null).size).toBe(0);
    expect(enabledProvidersFrom({ external: { apple: "true" } }).size).toBe(0);
    expect(enabledProvidersFrom("oops").size).toBe(0);
  });
});

describe("settlePendingSignIn", () => {
  const now = 1_000_000_000_000;
  const withStorage = (entries: Record<string, string>) => {
    const store = new Map(Object.entries(entries));
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
    return store;
  };
  afterEach(() => vi.unstubAllGlobals());

  it("returns the provider the session confirms, and remembers it", () => {
    const store = withStorage({ "gt-pending-sign-in": `apple:${now - 1000}` });
    expect(settlePendingSignIn([{ provider: "apple" }], now)).toBe("apple");
    expect(readSignInMethod()).toBe("apple");
    expect(store.has("gt-pending-sign-in")).toBe(false);
  });

  it("returns null when the session does not hold that provider, or without a note", () => {
    withStorage({ "gt-pending-sign-in": `google:${now - 1000}` });
    expect(settlePendingSignIn([{ provider: "email" }], now)).toBeNull();
    withStorage({});
    expect(settlePendingSignIn([{ provider: "google" }], now)).toBeNull();
  });
});
