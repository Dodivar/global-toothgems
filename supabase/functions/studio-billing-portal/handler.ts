import { corsHeaders, json, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import { accountStudioUrl, bearer, looksLikeJwt, STUDIO_LOCALES, type StudioLocale } from "../_shared/studioBilling.ts";

/**
 * POST /functions/v1/studio-billing-portal   { locale? }
 *
 * Opens the Stripe customer portal for the signed-in member's Stripe customer
 * (change plan or interval, update the card, see invoices, cancel at the end of
 * the period). Whatever is changed there reaches the site only through the
 * verified `stripe-webhook`. A member without a Stripe customer has nothing to
 * manage (`no_subscription`).
 */

export interface PortalDeps {
  origins: SiteOrigins;
  userFromToken(token: string): Promise<string | null>;
  customerOf(userId: string): Promise<string | null>;
  createPortalSession(args: { customerId: string; returnUrl: string; locale: StudioLocale }): Promise<{ url: string }>;
  log(message: string, detail?: unknown): void;
}

const MAX_BODY_BYTES = 1024;

async function localeOf(req: Request): Promise<StudioLocale | null> {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return null;
  if (!raw.trim()) return "fr";
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    if (Object.keys(body).some((key) => key !== "locale")) return null;
    const locale = body.locale ?? "fr";
    return (STUDIO_LOCALES as readonly string[]).includes(locale) ? locale : null;
  } catch {
    return null;
  }
}

export async function handlePortal(req: Request, deps: PortalDeps): Promise<Response> {
  const requestOrigin = req.headers.get("origin");
  const cors = corsHeaders(deps.origins, requestOrigin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });

  const token = bearer(req);
  if (!token || !looksLikeJwt(token)) return json({ error: "sign_in_required" }, 401, cors);
  const locale = await localeOf(req);
  if (!locale) return json({ error: "invalid_request" }, 400, cors);

  try {
    const userId = await deps.userFromToken(token);
    if (!userId) return json({ error: "session_expired" }, 401, cors);
    const customerId = await deps.customerOf(userId);
    if (!customerId) return json({ error: "no_subscription" }, 404, cors);
    const session = await deps.createPortalSession({
      customerId,
      returnUrl: accountStudioUrl(returnOrigin(deps.origins, requestOrigin)),
      locale,
    });
    return json({ url: session.url }, 200, cors);
  } catch (error) {
    deps.log("portal not opened", error instanceof Error ? error.message : error);
    return json({ error: "portal_unavailable" }, 502, cors);
  }
}
