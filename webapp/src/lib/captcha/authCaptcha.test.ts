import { afterEach, describe, expect, it, vi } from "vitest";

/* No DOM in the unit tests: a minimal document and a fake Turnstile API stand in. */

type Options = { callback?: (token: string) => void; "expired-callback"?: () => void };

function fakeBrowser() {
  const rendered: Options[] = [];
  const turnstile = {
    render: vi.fn((_container: unknown, options: Options) => {
      rendered.push(options);
      return "widget-1";
    }),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  const element = { style: { cssText: "" }, setAttribute: vi.fn() };
  vi.stubGlobal("window", { turnstile });
  vi.stubGlobal("document", {
    createElement: () => element,
    body: { appendChild: vi.fn() },
    documentElement: { lang: "fr" },
    head: { appendChild: vi.fn() },
  });
  return { turnstile, issue: (token: string) => rendered[0]?.callback?.(token) };
}

async function load(siteKey: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey);
  return import("./authCaptcha");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("authCaptchaToken", () => {
  it("sends no token and loads nothing without a site key", async () => {
    const { turnstile } = fakeBrowser();
    const { authCaptchaToken } = await load("");
    await expect(authCaptchaToken()).resolves.toBeUndefined();
    expect(turnstile.render).not.toHaveBeenCalled();
  });

  it("hands out each token once, then waits for the next one", async () => {
    const { turnstile, issue } = fakeBrowser();
    const { authCaptchaToken } = await load("site-key");

    const first = authCaptchaToken();
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalledTimes(1));
    issue("token-1");
    await expect(first).resolves.toBe("token-1");
    expect(turnstile.reset).toHaveBeenCalledWith("widget-1");

    // A token is single use: the next call does not get token-1 again.
    const second = authCaptchaToken();
    issue("token-2");
    await expect(second).resolves.toBe("token-2");
    expect(turnstile.render).toHaveBeenCalledTimes(1);
  });

  it("never blocks the call: no token in time means none is sent (Supabase decides)", async () => {
    vi.useFakeTimers();
    const { turnstile } = fakeBrowser();
    const { authCaptchaToken } = await load("site-key");
    const pending = authCaptchaToken();
    await vi.waitFor(() => expect(turnstile.render).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toBeUndefined();
  });
});
