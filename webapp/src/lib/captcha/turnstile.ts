"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile in the browser (visitor forms; owner's choice 2026-11-08 for the
 * newsletter). The public site key comes from NEXT_PUBLIC_TURNSTILE_SITE_KEY; without it no
 * script is loaded and forms behave as before. The token is checked by the Edge Function
 * (TURNSTILE_SECRET_KEY), never trusted here.
 *
 * The script is loaded only once a form asks for it (`enabled`, e.g. when the visitor starts
 * typing), not with the page. The widget runs in "interaction-only" mode: most visitors never
 * see it; it shows a check box only when Cloudflare needs one.
 */

export const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
export const isCaptchaConfigured = turnstileSiteKey.length > 0;

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance?: "always" | "execute" | "interaction-only";
      language?: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile script failed"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export interface CaptchaHandle {
  /** Where the widget draws itself (it stays empty for most visitors). */
  attach: (element: HTMLDivElement | null) => void;
  /** The current token, waiting up to `timeoutMs` for one; null when none came. */
  token(timeoutMs?: number): Promise<string | null>;
  /** A token is single use: ask for a fresh one after each submission. */
  reset(): void;
  /** The script or the widget failed (blocked by an extension, offline…). */
  failed: boolean;
}

export function useTurnstile(enabled: boolean, language: string): CaptchaHandle {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const widget = useRef<string | null>(null);
  const current = useRef<string | null>(null);
  const waiters = useRef<((token: string | null) => void)[]>([]);

  useEffect(() => {
    if (!enabled || !isCaptchaConfigured || !element) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || widget.current) return;
        widget.current = api.render(element, {
          sitekey: turnstileSiteKey,
          appearance: "interaction-only",
          language,
          callback: (token) => {
            current.current = token;
            for (const resolve of waiters.current.splice(0)) resolve(token);
          },
          "expired-callback": () => {
            current.current = null;
          },
          "error-callback": () => {
            current.current = null;
            setFailed(true);
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
      current.current = null;
    };
  }, [enabled, element, language]);

  const token = useCallback((timeoutMs = 10_000) => {
    if (current.current) return Promise.resolve(current.current);
    return new Promise<string | null>((resolve) => {
      const done = (value: string | null) => {
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => {
        waiters.current = waiters.current.filter((w) => w !== done);
        resolve(null);
      }, timeoutMs);
      waiters.current.push(done);
    });
  }, []);

  const reset = useCallback(() => {
    current.current = null;
    if (widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, []);

  return { attach: setElement, token, reset, failed };
}
