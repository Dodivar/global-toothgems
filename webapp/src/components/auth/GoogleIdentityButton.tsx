"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createGoogleNonce, googleClientId, loadGoogleIdentity } from "../../lib/googleIdentity";

/**
 * Google's official "Continue with Google" button. Google draws it (its
 * pop-up cannot be opened from a button of ours), inside a container of ours.
 * A click opens Google's pop-up, which names this site; the ID token and the
 * nonce it was issued for come back through `onCredential`.
 *
 * `onUnavailable` fires when Google's script cannot load, so the caller can
 * fall back to the redirect.
 */
export function GoogleIdentityButton({
  onCredential,
  onUnavailable,
  onBeforeSignIn,
  text = "continue_with",
}: {
  onCredential: (token: string, nonce: string) => void;
  onUnavailable: () => void;
  /** Called when the visitor clicks, before Google answers (notes the terms accepted, for instance). */
  onBeforeSignIn?: () => void;
  text?: "signin_with" | "signup_with" | "continue_with";
}) {
  const { i18n } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  // Latest callbacks without re-initialising Google's button on every render.
  const callbacks = useRef({ onCredential, onUnavailable, onBeforeSignIn });
  useEffect(() => {
    callbacks.current = { onCredential, onUnavailable, onBeforeSignIn };
  });

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    void (async () => {
      try {
        const [google, nonce] = await Promise.all([loadGoogleIdentity(), createGoogleNonce()]);
        if (cancelled) return;
        google.accounts.id.initialize({
          client_id: googleClientId,
          nonce: nonce.hashed,
          use_fedcm_for_button: true,
          callback: ({ credential }) => {
            if (credential) callbacks.current.onCredential(credential, nonce.raw);
            else callbacks.current.onUnavailable();
          },
        });
        element.replaceChildren();
        google.accounts.id.renderButton(element, {
          type: "standard",
          theme: "outline",
          size: "large",
          text,
          shape: "rectangular",
          logo_alignment: "center",
          width: Math.min(400, Math.max(200, Math.round(element.getBoundingClientRect().width))),
          locale: i18n.language?.startsWith("en") ? "en" : "fr",
        });
      } catch {
        if (!cancelled) callbacks.current.onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [i18n.language, text]);

  return (
    <div
      ref={host}
      onClickCapture={() => callbacks.current.onBeforeSignIn?.()}
      className="flex min-h-[44px] w-full justify-center"
    />
  );
}
