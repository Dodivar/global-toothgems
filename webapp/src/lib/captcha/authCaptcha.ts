import { isCaptchaConfigured, loadTurnstile, turnstileSiteKey } from "./turnstile";

/**
 * The Turnstile token Supabase Auth checks once its captcha protection is on
 * (Auth › Attack Protection › Captcha, Cloudflare Turnstile, with the secret
 * that matches NEXT_PUBLIC_TURNSTILE_SITE_KEY; decision 137). Every Auth call
 * Supabase protects asks for one here — sign-in with a password or a Google
 * ID token, sign-up, password reset, confirmation e-mails — so no screen has
 * to carry a widget of its own.
 *
 * One invisible widget for the whole tab ("interaction-only"): most visitors
 * never see it; when Cloudflare needs a click it shows its box in the corner
 * of the screen. A token is single use, so the widget is reset after each
 * one is handed out.
 *
 * Never blocks a request: without a site key, or when the script cannot load
 * (offline, blocked), the call goes out without a token and Supabase decides —
 * it ignores the token while its protection is off and answers
 * `captcha_failed` while it is on (`isAuthCaptchaRefusal`).
 */

const WAIT_MS = 15_000;

let widgetId: string | null = null;
let current: string | null = null;
let waiters: ((token: string | null) => void)[] = [];

function settle(token: string | null) {
  current = token;
  if (token) for (const resolve of waiters.splice(0)) resolve(token);
}

async function ensureWidget(): Promise<boolean> {
  if (widgetId) return true;
  const api = await loadTurnstile();
  if (widgetId) return true;
  const container = document.createElement("div");
  container.setAttribute("data-auth-captcha", "");
  container.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:1000";
  document.body.appendChild(container);
  widgetId = api.render(container, {
    sitekey: turnstileSiteKey,
    appearance: "interaction-only",
    language: document.documentElement.lang?.startsWith("en") ? "en" : "fr",
    callback: (token) => settle(token),
    "expired-callback": () => settle(null),
    "error-callback": () => settle(null),
  });
  return true;
}

/** A fresh token for one Auth call, or undefined (no captcha configured, or none came in time). */
export async function authCaptchaToken(): Promise<string | undefined> {
  if (!isCaptchaConfigured || typeof window === "undefined") return undefined;
  try {
    await ensureWidget();
  } catch {
    return undefined;
  }
  const token =
    current ??
    (await new Promise<string | null>((resolve) => {
      const done = (value: string | null) => {
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        waiters = waiters.filter((waiter) => waiter !== done);
        resolve(null);
      }, WAIT_MS);
      waiters.push(done);
    }));
  // Single use: the next call waits for the next token.
  current = null;
  if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
  return token ?? undefined;
}
