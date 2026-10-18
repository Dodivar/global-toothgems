import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TypedSupabaseClient } from "./client";
import {
  parseStoredSignedUrls,
  partitionPaths,
  resetSignedUrlCacheForTests,
  stableSignedUrls,
  type CachedSignedUrl,
} from "./signedUrlCache";

/** A minimal sessionStorage for the Node test environment. */
function stubSessionStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    },
  });
}

const OPTIONS = { bucket: "training-media", ttlSeconds: 3600, minRemainingSeconds: 600 };

/** A client whose signing call returns a new token every time, like Storage. */
function fakeClient(userId: string | null) {
  let calls = 0;
  const createSignedUrls = vi.fn(async (paths: string[]) => {
    calls += 1;
    return {
      data: paths.map((path) => ({ path, signedUrl: `https://cdn.test/${path}?token=${userId}-${calls}`, error: null })),
      error: null,
    };
  });
  const client = {
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
    storage: { from: () => ({ createSignedUrls }) },
  } as unknown as TypedSupabaseClient;
  return { client, createSignedUrls };
}

describe("partitionPaths", () => {
  const cache = new Map<string, CachedSignedUrl>([
    ["a", { url: "https://x/a", expiresAt: 10_000 }],
    ["b", { url: "https://x/b", expiresAt: 1_500 }],
  ]);

  it("reuses URLs with enough life left and signs the rest once", () => {
    const { reused, toSign } = partitionPaths(cache, (p) => p, ["a", "b", "c", "c"], 1_000, 1_000);
    expect([...reused]).toEqual([["a", "https://x/a"]]);
    expect(toSign).toEqual(["b", "c"]);
  });
});

describe("parseStoredSignedUrls", () => {
  it("keeps only well-formed entries still valid", () => {
    const raw = JSON.stringify({
      ok: { url: "https://x/a", expiresAt: 5_000 },
      expired: { url: "https://x/b", expiresAt: 1_000 },
      script: { url: "javascript:alert(1)", expiresAt: 5_000 },
      bad: { url: 3, expiresAt: 5_000 },
    });
    expect([...parseStoredSignedUrls(raw, 2_000).keys()]).toEqual(["ok"]);
    expect(parseStoredSignedUrls("not json", 0).size).toBe(0);
    expect(parseStoredSignedUrls("[]", 0).size).toBe(0);
    expect(parseStoredSignedUrls(null, 0).size).toBe(0);
  });
});

describe("stableSignedUrls", () => {
  beforeEach(() => {
    stubSessionStorage();
    resetSignedUrlCacheForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns the same address while it has enough life left", async () => {
    const { client, createSignedUrls } = fakeClient("user-1");
    const first = await stableSignedUrls(client, ["m/1.png", "m/2.png"], OPTIONS);
    vi.advanceTimersByTime(45 * 60 * 1000);
    const second = await stableSignedUrls(client, ["m/1.png", "m/2.png"], OPTIONS);
    expect(second).toEqual(first);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it("signs again only the URLs near their expiry", async () => {
    const { client, createSignedUrls } = fakeClient("user-1");
    const first = await stableSignedUrls(client, ["m/1.png"], OPTIONS);
    vi.advanceTimersByTime(30 * 60 * 1000);
    await stableSignedUrls(client, ["m/2.png"], OPTIONS);
    vi.advanceTimersByTime(21 * 60 * 1000); // 1.png has 9 min left, 2.png 39 min.
    const third = await stableSignedUrls(client, ["m/1.png", "m/2.png"], OPTIONS);
    expect(createSignedUrls).toHaveBeenLastCalledWith(["m/1.png"], 3600);
    expect(third.get("m/1.png")).not.toBe(first.get("m/1.png"));
  });

  it("survives a reload of the tab through sessionStorage", async () => {
    const { client } = fakeClient("user-1");
    const first = await stableSignedUrls(client, ["m/1.png"], OPTIONS);
    resetSignedUrlCacheForTests();
    const { client: reloaded, createSignedUrls } = fakeClient("user-1");
    expect(await stableSignedUrls(reloaded, ["m/1.png"], OPTIONS)).toEqual(first);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it("never hands one account's URL to another", async () => {
    const { client } = fakeClient("user-1");
    const first = await stableSignedUrls(client, ["m/1.png"], OPTIONS);
    const { client: other, createSignedUrls } = fakeClient("user-2");
    const second = await stableSignedUrls(other, ["m/1.png"], OPTIONS);
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(second.get("m/1.png")).not.toBe(first.get("m/1.png"));
  });

  it("leaves out paths the user may not read", async () => {
    const createSignedUrls = vi.fn(async () => ({
      data: [{ path: "m/1.png", signedUrl: "", error: "Either the object does not exist or you do not have access to it" }],
      error: null,
    }));
    const client = {
      auth: { getSession: async () => ({ data: { session: null } }) },
      storage: { from: () => ({ createSignedUrls }) },
    } as unknown as TypedSupabaseClient;
    expect((await stableSignedUrls(client, ["m/1.png"], OPTIONS)).size).toBe(0);
    expect((await stableSignedUrls(client, ["m/1.png"], OPTIONS)).size).toBe(0);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
  });
});
