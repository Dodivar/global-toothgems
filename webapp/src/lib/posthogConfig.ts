/**
 * PostHog settings shared by the browser SDK (`instrumentation-client.ts`),
 * the reverse proxy (`next.config.ts`), the server error capture
 * (`instrumentation.ts`) and the session-replay switch (`PostHogSession.tsx`).
 * Pure: no SDK import, unit-tested.
 */

/** The same-origin path the browser sends PostHog requests to (rewritten in `next.config.ts`). */
export const POSTHOG_PROXY_PATH = "/ingest";

export interface PostHogHosts {
  /** Where `/ingest/*` is forwarded: the ingestion host. */
  ingest: string;
  /** Where `/ingest/static/*` is forwarded: the SDK's lazy-loaded scripts (replay, toolbar…). */
  assets: string;
  /** The PostHog app, for the links the SDK builds (toolbar). */
  ui: string;
}

/**
 * The hosts behind PostHog Cloud's ingestion address (`https://eu.i.posthog.com`
 * or `https://us.i.posthog.com`). Anything else (self-hosted, malformed) is not
 * proxied: `null`, and the browser talks to the configured host directly.
 */
export function posthogCloudHosts(host: string | undefined): PostHogHosts | null {
  if (!host) return null;
  let url: URL;
  try {
    url = new URL(host);
  } catch {
    return null;
  }
  const match = /^(eu|us)\.i\.posthog\.com$/.exec(url.hostname);
  if (url.protocol !== "https:" || !match) return null;
  const region = match[1];
  return {
    ingest: `https://${region}.i.posthog.com`,
    assets: `https://${region}-assets.i.posthog.com`,
    ui: `https://${region}.posthog.com`,
  };
}

/**
 * Query parameters whose value PostHog replaces by `<MASKED>` in every URL it
 * records (`mask_personal_data_properties`): sign-in codes and tokens that
 * Supabase Auth or our own links may carry, and an e-mail address.
 * URL fragments are not recorded at all (`disable_capture_url_hashes`), which
 * covers the withdrawal link's token and Supabase's recovery fragments.
 */
export const POSTHOG_MASKED_URL_PARAMS = ["code", "token", "token_hash", "access_token", "refresh_token", "email"];

/**
 * Where session replay may record (owner's go-ahead, 2026-11-12): the
 * storefront (`/fr/…`, `/en/…`), the 3D Studio and the learner pages — the
 * journeys worth watching (cart and checkout, the editor, lessons).
 * Never the member space, the back office, sign-in and recovery pages, or the
 * guest withdrawal page: they show personal data (addresses, orders, other
 * customers) that input masking alone does not hide. An allow-list, so a new
 * zone is not recorded until someone decides it should be.
 */
const REPLAY_EXCLUDED_PUBLIC = [
  // Guest withdrawal (decision 131): shows the order's lines and the customer's e-mail.
  "/fr/retours-remboursements/retractation",
  "/en/returns/withdrawal",
];

export function replayAllowed(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? "";
  if (REPLAY_EXCLUDED_PUBLIC.some((excluded) => path === excluded || path.startsWith(`${excluded}/`))) return false;
  return /^\/(fr|en|studio-3d|academy)(\/|$)/.test(path);
}

/** `app_environment` on every event: production, preview or development. */
export function appEnvironment(): string {
  return process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
}
