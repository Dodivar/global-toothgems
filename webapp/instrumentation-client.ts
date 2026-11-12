import posthog from "posthog-js";
import { POSTHOG_MASKED_URL_PARAMS, POSTHOG_PROXY_PATH, posthogCloudHosts } from "./src/lib/posthogConfig";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken) {
  if (process.env.NODE_ENV === "development") console.warn("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured");
} else if (!host) {
  if (process.env.NODE_ENV === "development") console.warn("NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured");
} else {
  // PostHog Cloud goes through our own address (`/ingest`, rewritten in
  // `next.config.ts`), which ad blockers do not cut; another host is called directly.
  const cloud = posthogCloudHosts(host);
  posthog.init(projectToken, {
    api_host: cloud ? POSTHOG_PROXY_PATH : host,
    ...(cloud ? { ui_host: cloud.ui } : {}),
    defaults: "2026-01-30",
    capture_exceptions: true,
    // Nothing is captured until the visitor accepts the analytics category
    // (`CookieConsentProvider` opts in and out).
    opt_out_capturing_by_default: true,
    // ...and nothing is stored either: while opted out PostHog keeps no
    // `ph_<token>_posthog` cookie or local entry (an identifier set before
    // consent would itself need consent), and opting out erases it.
    opt_out_persistence_by_default: true,
    // Person profiles only for signed-in members (their id, nothing else:
    // `PostHogIdentity` in `lib/auth.tsx`).
    person_profiles: "identified_only",
    // URLs: no fragment (the withdrawal link's token, Supabase recovery
    // fragments) and sign-in codes or tokens in the query masked.
    disable_capture_url_hashes: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: POSTHOG_MASKED_URL_PARAMS,
    // Session replay starts only with consent and only on the zones
    // `replayAllowed()` lists (`PostHogSession.tsx`). Every input is masked;
    // `data-ph-mask` masks a text, `ph-no-capture` hides an element.
    disable_session_recording: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]",
    },
    debug: process.env.NODE_ENV === "development",
  });
}
