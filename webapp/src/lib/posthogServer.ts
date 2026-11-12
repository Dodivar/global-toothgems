import "server-only";

import { PostHog } from "posthog-node";

/**
 * Server errors sent to PostHog's error tracking (`instrumentation.ts`
 * `onRequestError`): Server Components, Route Handlers and the proxy.
 *
 * Nothing about the visitor: no cookie, header or IP (`disableGeoip`), the
 * address without its query string (it may carry a sign-in code), and one
 * fixed anonymous id that creates no person profile. So this needs no
 * analytics consent — it reports a fault of the site, not a visitor's
 * behaviour — and never joins a visitor's browser history.
 */

const SERVER_DISTINCT_ID = "nextjs-server";

let client: PostHog | null | undefined;

function serverClient(): PostHog | null {
  if (client !== undefined) return client;
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  // Serverless: send each event at once rather than batching.
  client = token && host ? new PostHog(token, { host, flushAt: 1, flushInterval: 0, disableGeoip: true }) : null;
  return client;
}

export interface ServerErrorContext {
  path: string;
  method: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
}

/** Reports one server error. Never throws: monitoring must not add a second failure. */
export async function captureServerError(error: unknown, context: ServerErrorContext): Promise<void> {
  const posthog = serverClient();
  if (!posthog) return;
  try {
    const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
    await posthog.captureExceptionImmediate(error, SERVER_DISTINCT_ID, {
      $process_person_profile: false,
      source: "nextjs-server",
      path: context.path.split("?")[0],
      method: context.method,
      route_path: context.routePath,
      route_type: context.routeType,
      ...(context.renderSource ? { render_source: context.renderSource } : {}),
      ...(digest ? { digest } : {}),
      app_environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    });
  } catch {
    /* swallowed: the original error is already logged by Next.js */
  }
}
