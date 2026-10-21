import posthog from "posthog-js";
import { hoursSince, trialRemainingMs, type StudioAccessInfo } from "./studioAccessState";

/**
 * The 3D Studio's trial-to-subscription events, sent to PostHog — the site's
 * analytics (`instrumentation-client.ts`) — under the `studio_` prefix.
 *
 * - Only with the visitor's analytics consent (`cookieConsent`, category
 *   "analytics"): without it nothing is sent.
 * - Never in the way: a missing or failing PostHog is swallowed, so the Studio
 *   and checkout work whatever happens here.
 * - Nothing personal or creative: no e-mail, no name, no design content. The
 *   person is PostHog's own identity (set at sign-in in `auth.tsx`).
 * - Each event marks a real transition and is deduplicated where a remount, a
 *   refresh or a second tab could repeat it (`once`).
 *
 * The event list, their properties and how the funnel metrics are computed
 * from them are documented in `docs/studio-trial-analytics.md`.
 */

export type StudioEvent =
  | "studio_trial_offer_viewed"
  | "studio_trial_started"
  | "studio_first_design_created"
  | "studio_first_design_saved"
  | "studio_session_started"
  | "studio_session_ended"
  | "studio_feature_used"
  | "studio_design_created"
  | "studio_design_saved"
  | "studio_design_edited"
  | "studio_template_used"
  | "studio_return_visit"
  | "studio_trial_expiration_warning_shown"
  | "studio_trial_expired"
  | "studio_trial_access_blocked"
  | "studio_subscription_plans_viewed"
  | "studio_subscription_cta_clicked"
  | "studio_checkout_started"
  | "studio_subscription_completed"
  | "studio_checkout_canceled"
  | "studio_checkout_failed"
  | "studio_access_check_failed"
  | "studio_access_denied"
  | "studio_access_restored"
  /** A social network button of the export dialog (decision 101): network, output, format, method. */
  | "studio_social_share_clicked";

type Props = Record<string, string | number | boolean | null | string[]>;

let consented = false;
let access: StudioAccessInfo | null = null;
let accessReadAt = 0;

/** Set by the Studio access provider from the cookie choice. */
export function setStudioAnalyticsConsent(value: boolean) {
  consented = value;
}

/** The latest access state, so every event carries the trial context. */
export function setStudioAnalyticsAccess(info: StudioAccessInfo | null, readAtPerf = 0) {
  access = info;
  accessReadAt = readAtPerf;
}

export function studioAnalyticsAllowed() {
  return consented;
}

function deviceCategory(): string {
  try {
    const width = window.innerWidth;
    return width < 768 ? "mobile" : width < 1024 ? "tablet" : "desktop";
  } catch {
    return "unknown";
  }
}

function contextProps(): Props {
  const props: Props = {
    device_category: deviceCategory(),
    app_environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
  };
  if (access) {
    const now = access.serverNow + Math.max(0, performance.now() - accessReadAt);
    const left = trialRemainingMs(access, now);
    props.access_state = access.state;
    props.trial_started_at = access.trialStartedAt === null ? null : new Date(access.trialStartedAt).toISOString();
    props.trial_expires_at = access.trialExpiresAt === null ? null : new Date(access.trialExpiresAt).toISOString();
    props.hours_since_trial_start = hoursSince(access.trialStartedAt, now);
    props.hours_remaining = left === null ? null : Math.round((left / 3_600_000) * 10) / 10;
    props.subscription_plan = access.subscriptionPlan;
  }
  return props;
}

/** Sends one event, if allowed. Never throws. */
export function trackStudio(event: StudioEvent, props: Props = {}) {
  if (!consented) return;
  try {
    posthog.capture(event, { ...contextProps(), ...props });
  } catch {
    /* analytics must never break the Studio */
  }
}

function storageFor(scope: "tab" | "browser"): Storage | null {
  try {
    return scope === "tab" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * True the first time `key` is seen in this tab ("tab") or this browser
 * ("browser"), then false. Without storage it answers true once per page.
 */
const seenInPage = new Set<string>();
export function once(key: string, scope: "tab" | "browser" = "tab"): boolean {
  const full = `gt-studio-evt:${key}`;
  if (seenInPage.has(full)) return false;
  seenInPage.add(full);
  const store = storageFor(scope);
  if (!store) return true;
  try {
    if (store.getItem(full)) return false;
    store.setItem(full, "1");
  } catch {
    /* blocked storage: the in-page guard above still holds */
  }
  return true;
}

/** `trackStudio` guarded by `once`. */
export function trackStudioOnce(key: string, event: StudioEvent, props: Props = {}, scope: "tab" | "browser" = "tab") {
  if (!consented) return;
  if (once(key, scope)) trackStudio(event, props);
}
