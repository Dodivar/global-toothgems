/**
 * Responses, CORS and the allow-list of site origins.
 *
 * Return addresses (Stripe success / cancel URLs) are only ever built from an
 * origin in the allow-list: `SITE_URL` (production) plus the exact origins of
 * `ALLOWED_RETURN_ORIGINS` (localhost, previews). A request coming from any
 * other origin gets the production address and no CORS grant.
 */

export function parseOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export interface SiteOrigins {
  /** The production origin, used whenever the request's origin is not allowed. */
  site: string;
  allowed: ReadonlySet<string>;
}

export function readSiteOrigins(siteUrl: string | undefined, extra: string | undefined): SiteOrigins {
  const site = parseOrigin(siteUrl);
  if (!site) throw new Error("SITE_URL is missing or invalid");
  const allowed = new Set([site]);
  for (const entry of (extra ?? "").split(",")) {
    const origin = parseOrigin(entry);
    if (origin) allowed.add(origin);
  }
  return { site, allowed };
}

/** The origin return addresses are built on: the caller's when allowed, else production. */
export function returnOrigin(origins: SiteOrigins, requestOrigin: string | null): string {
  const origin = parseOrigin(requestOrigin);
  return origin && origins.allowed.has(origin) ? origin : origins.site;
}

export function corsHeaders(origins: SiteOrigins, requestOrigin: string | null): Record<string, string> {
  const origin = parseOrigin(requestOrigin);
  if (!origin || !origins.allowed.has(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Reads a JSON body of at most `maxBytes`; null when too large or not JSON. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
