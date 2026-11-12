"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./supabase/env";

/**
 * Which sign-in providers the Supabase project has switched on.
 *
 * Google and Apple are enabled by the owner in the Supabase dashboard
 * (Authentication › Sign In / Providers). A button for a provider that is still
 * off would send the visitor to an error page, so the Apple button is shown
 * only once the project's public Auth settings (`/auth/v1/settings`, read with
 * the publishable key) say Apple is on. Google keeps its button whatever the
 * answer: it has been live since 2026-10-04.
 */

export type OAuthProvider = "google" | "apple";

/** Reads `external` from the settings answer; anything unexpected means "off". */
export function enabledProvidersFrom(settings: unknown): Set<OAuthProvider> {
  const enabled = new Set<OAuthProvider>();
  const external = settings && typeof settings === "object" ? (settings as { external?: unknown }).external : undefined;
  if (!external || typeof external !== "object") return enabled;
  for (const provider of ["google", "apple"] as const) {
    if ((external as Record<string, unknown>)[provider] === true) enabled.add(provider);
  }
  return enabled;
}

let pending: Promise<Set<OAuthProvider>> | null = null;

/** Asked once per page load; an unreachable answer reads as "nothing extra enabled" and may be asked again later. */
function loadEnabledProviders(): Promise<Set<OAuthProvider>> {
  if (!isSupabaseConfigured) return Promise.resolve(new Set());
  pending ??= fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabasePublishableKey } })
    .then((response) => (response.ok ? response.json() : null))
    .then(enabledProvidersFrom)
    .catch(() => {
      pending = null;
      return new Set<OAuthProvider>();
    });
  return pending;
}

/** True once the project says Apple sign-in is on (false on the server, while loading, and in mock mode). */
export function useAppleSignInEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void loadEnabledProviders().then((providers) => {
      if (active) setEnabled(providers.has("apple"));
    });
    return () => {
      active = false;
    };
  }, []);
  return enabled;
}
