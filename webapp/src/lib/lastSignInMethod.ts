"use client";

import { useEffect, useState } from "react";
import type { OAuthProvider } from "./authProviders";

/**
 * The sign-in method this browser used last, for the "Last used" badge on the
 * Google and Apple buttons of `/connexion` and `/inscription`.
 *
 * It is a convenience note kept in this browser only (`localStorage`, listed in
 * the cookie policy): the method's name, never the address or anything about
 * the account. It is written only after a sign-in that worked — at once for a
 * password or Google's own button, and for a redirect (Google, Apple) once the
 * browser comes back with a session whose identities include that provider.
 * It survives signing out (that is its point) and is removed with the account.
 */

export type SignInMethod = "email" | OAuthProvider;

const KEY = "gt-last-sign-in";
const PENDING_KEY = "gt-pending-sign-in";

/** Long enough for a slow provider page, short enough not to outlive the errand. */
export const PENDING_SIGN_IN_TTL_MS = 15 * 60 * 1000;

const METHODS: readonly SignInMethod[] = ["email", "google", "apple"];

export const isSignInMethod = (value: unknown): value is SignInMethod =>
  typeof value === "string" && (METHODS as readonly string[]).includes(value);

/** "google:1700000000000" → the provider, when the note is fresh and well formed. */
export function readPendingNote(value: string | null, now: number): OAuthProvider | null {
  if (!value) return null;
  const [provider, at] = value.split(":");
  const time = Number(at);
  if (provider !== "google" && provider !== "apple") return null;
  if (!Number.isFinite(time) || now - time < 0 || now - time > PENDING_SIGN_IN_TTL_MS) return null;
  return provider;
}

/** Whether a session's identities (`user.identities[].provider`) include the provider. */
export function identitiesInclude(identities: readonly { provider?: string }[] | undefined, provider: OAuthProvider): boolean {
  return Array.isArray(identities) && identities.some((identity) => identity?.provider === provider);
}

const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Records a sign-in that worked. */
export function rememberSignInMethod(method: SignInMethod): void {
  try {
    storage()?.setItem(KEY, method);
  } catch {
    // Storage blocked: no badge, nothing else changes.
  }
  listeners.forEach((listener) => listener());
}

/** Notes the provider the browser is leaving for; confirmed by `settlePendingSignIn` on its return. */
export function notePendingSignIn(provider: OAuthProvider, now: number = Date.now()): void {
  try {
    storage()?.setItem(PENDING_KEY, `${provider}:${now}`);
  } catch {
    // Storage blocked: the badge simply will not follow this sign-in.
  }
}

/**
 * Called with the user of a newly opened session: a fresh note whose provider
 * is among the session's identities becomes the last method. The note is
 * removed either way, so it cannot be confirmed by a later, unrelated session.
 */
export function settlePendingSignIn(identities: readonly { provider?: string }[] | undefined, now: number = Date.now()): void {
  const store = storage();
  if (!store) return;
  let provider: OAuthProvider | null = null;
  try {
    provider = readPendingNote(store.getItem(PENDING_KEY), now);
    store.removeItem(PENDING_KEY);
  } catch {
    return;
  }
  if (provider && identitiesInclude(identities, provider)) rememberSignInMethod(provider);
}

export function readSignInMethod(): SignInMethod | null {
  try {
    const value = storage()?.getItem(KEY) ?? null;
    return isSignInMethod(value) ? value : null;
  } catch {
    return null;
  }
}

/** Removed with the account (deletion), so the next visitor of this browser sees no trace of it. */
export function forgetSignInMethod(): void {
  try {
    storage()?.removeItem(KEY);
    storage()?.removeItem(PENDING_KEY);
  } catch {
    // Nothing to forget.
  }
  listeners.forEach((listener) => listener());
}

/** The last method, read once hydrated (null on the server and on the first browser render). */
export function useLastSignInMethod(): SignInMethod | null {
  const [method, setMethod] = useState<SignInMethod | null>(null);
  useEffect(() => {
    const update = () => setMethod(readSignInMethod());
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return method;
}
