import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (!projectToken) {
  if (process.env.NODE_ENV === "development") console.warn("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is configured");
} else if (!host) {
  if (process.env.NODE_ENV === "development") console.warn("NEXT_PUBLIC_POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_HOST is configured");
} else {
  posthog.init(projectToken, {
    api_host: host,
    defaults: "2026-01-30",
    capture_exceptions: true,
    // Nothing is captured until the visitor accepts the analytics category
    // (`CookieConsentProvider` opts in and out).
    opt_out_capturing_by_default: true,
    // ...and nothing is stored either: while opted out PostHog keeps no
    // `ph_<token>_posthog` cookie or local entry (an identifier set before
    // consent would itself need consent), and opting out erases it.
    opt_out_persistence_by_default: true,
    debug: process.env.NODE_ENV === "development",
  });
}
