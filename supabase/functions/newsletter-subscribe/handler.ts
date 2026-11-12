import { clientAddress, corsHeaders, json, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import { hashAddress, isValidAddress, type SendRequest, type SendResult } from "../_shared/email/send.ts";
import type { EmailContent } from "../_shared/email/render.ts";

/**
 * POST /functions/v1/newsletter-subscribe — the storefront newsletter form's only way in.
 *
 *   browser ──(JSON: email, locale, source, policy_version, consent, captcha?)──▶ this function
 *     1. validates the fields; the box the person ticked is required (explicit consent)
 *     2. throttles by caller address (newsletter_ip_allowed: 10 / hour); the database
 *        throttles by e-mail on top (3 / hour)
 *     3. subscribes at once (newsletter_subscribe_direct, owner's choice 2026-11-08) when the
 *        request carries a proof that a person asked:
 *          - a signed-in member subscribing their own account's (confirmed) address, or
 *          - a Cloudflare Turnstile token that passes, once TURNSTILE_SECRET_KEY is set
 *        → `{ status: "subscribed" }`
 *     4. otherwise (no captcha configured yet): the double opt-in — newsletter_subscribe()
 *        and the e-mailed link <site>/newsletter/confirmer?token=… → `{ status: "sent" }`
 *
 * Once the captcha is configured, a visitor request without a valid token is refused
 * (`captcha_required` / `captcha_failed`); a member's own address never needs one.
 *
 * Why a function and not a Next.js route: the two database functions are service role only
 * and the Next.js server must not hold that key (AGENTS.md §4). The honeypot field `website`
 * and the two throttles stay in front of everything.
 *
 * The answer never depends on the address's state (new, pending, already subscribed, bounced,
 * complained), so the form never tells whether an address is on the list. Errors are
 * `{ error }` with a short code.
 */

const SOURCES = ["home", "footer"] as const;
type Source = (typeof SOURCES)[number];

/** The form's body is a handful of short fields. */
const MAX_REQUEST_BYTES = 4 * 1024;
const POLICY_VERSION = /^[0-9A-Za-z._-]{1,40}$/;
/** Turnstile tokens are at most 2048 characters. */
const MAX_CAPTCHA = 2048;

export interface Subscription {
  email: string;
  locale: "fr" | "en";
  source: Source;
  policyVersion: string;
}

export type DbError = { code?: string; message?: string };

export type DirectMethod = "member_session" | "captcha";

export interface Member {
  id: string;
  email: string | null;
  /** The account's address was confirmed (sign-up link, or a provider such as Google). */
  emailConfirmed: boolean;
}

export interface SubscribeDeps {
  origins: SiteOrigins;
  /** The member behind a Supabase access token, or null (a visitor's publishable key is not one). */
  userFromToken(token: string): Promise<Member | null>;
  /** True once TURNSTILE_SECRET_KEY is set: visitors then need a passing token. */
  captchaConfigured: boolean;
  /** Turnstile's server-side check of the token. */
  verifyCaptcha(token: string, remoteIp: string | null): Promise<boolean>;
  /** newsletter_subscribe_direct() as the service role. */
  subscribeDirect(subscription: Subscription, method: DirectMethod): Promise<{ status: string } | { error: DbError }>;
  /** False when this caller address has used up its attempts. */
  ipAllowed(ipHash: string): Promise<boolean>;
  /** newsletter_subscribe() as the service role: `{status, confirm_token?}` or the database error. */
  subscribe(subscription: Subscription): Promise<{ status: string; confirmToken: string | null } | { error: DbError }>;
  sendEmail(request: SendRequest): Promise<SendResult>;
  log(message: string, detail?: unknown): void;
}

function parseBody(raw: unknown): (Subscription & { honeypot: boolean; captcha: string | null }) | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
  const honeypot = str("website") !== "";
  const email = str("email").toLowerCase();
  const locale = str("locale") === "en" ? "en" : "fr";
  const source = str("source");
  const policyVersion = str("policy_version");
  const captcha = str("captcha");
  if (captcha.length > MAX_CAPTCHA) return null;
  if (body.consent !== true) return null;
  if (!isValidAddress(email)) return null;
  if (!(SOURCES as readonly string[]).includes(source)) return null;
  if (!POLICY_VERSION.test(policyVersion)) return null;
  return { email, locale, source: source as Source, policyVersion, honeypot, captcha: captcha || null };
}

const BUTTON = { fr: "Confirmer mon inscription", en: "Confirm my subscription" } as const;

/** The confirmation link as a button, in the language of the template actually found. */
export function confirmationContent(confirmUrl: string): (locale: string) => EmailContent {
  return (locale) => ({ primaryAction: { label: locale === "fr" ? BUTTON.fr : BUTTON.en, url: confirmUrl } });
}

export async function handleSubscribe(req: Request, deps: SubscribeDeps): Promise<Response> {
  const requestOrigin = req.headers.get("Origin");
  const cors = corsHeaders(deps.origins, requestOrigin);
  const reply = (body: unknown, status: number) => json(body, status, cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  if (Number(req.headers.get("content-length") ?? "0") > MAX_REQUEST_BYTES) return reply({ error: "invalid_request" }, 413);

  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_REQUEST_BYTES) return reply({ error: "invalid_request" }, 413);
    raw = JSON.parse(text);
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }

  const fields = parseBody(raw);
  if (!fields) return reply({ error: "invalid_request" }, 400);
  // Honeypot: a field no person sees. A bot that fills it is told all went well.
  if (fields.honeypot) return reply({ status: "sent" }, 200);

  const ip = clientAddress(req);
  if (ip && !(await deps.ipAllowed(await hashAddress(ip)))) return reply({ error: "rate_limited" }, 429);

  const { honeypot: _honeypot, captcha, ...subscription } = fields;

  // A signed-in member subscribing their own address: the account is the proof.
  const auth = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  const member = auth ? await deps.userFromToken(auth).catch(() => null) : null;
  if (member && member.emailConfirmed && member.email?.trim().toLowerCase() === subscription.email) {
    return await direct(deps, reply, subscription, "member_session");
  }

  if (deps.captchaConfigured) {
    if (!captcha) return reply({ error: "captcha_required" }, 400);
    let passed: boolean;
    try {
      passed = await deps.verifyCaptcha(captcha, ip);
    } catch (error) {
      deps.log("captcha check failed", error instanceof Error ? error.message : error);
      return reply({ error: "server_error" }, 502);
    }
    if (!passed) return reply({ error: "captcha_failed" }, 400);
    return await direct(deps, reply, subscription, "captcha");
  }

  const result = await deps.subscribe(subscription).catch((error) => ({
    error: { message: error instanceof Error ? error.message : String(error) } as DbError,
  }));
  if ("error" in result) {
    const { code, message } = result.error;
    if (code === "PT429") return reply({ error: "rate_limited" }, 429);
    if (code === "22023") return reply({ error: "invalid_request" }, 400);
    deps.log("newsletter_subscribe failed", { code, message });
    return reply({ error: "server_error" }, 500);
  }

  // Already subscribed, bounced or complained: no e-mail, same answer.
  if (result.status !== "pending" || !result.confirmToken) return reply({ status: "sent" }, 200);

  const confirmUrl = `${returnOrigin(deps.origins, requestOrigin)}/newsletter/confirmer?token=${result.confirmToken}`;
  try {
    const sent = await deps.sendEmail({
      templateKey: "newsletter_confirmation",
      to: subscription.email,
      locale: subscription.locale,
      variables: { confirm_url: confirmUrl },
      // One e-mail per token: a retry of the same request never sends it twice.
      eventKey: `newsletter_confirmation:${(await hashAddress(result.confirmToken)).slice(0, 32)}`,
      content: confirmationContent(confirmUrl),
    });
    if (sent.status === "sent" || sent.status === "duplicate") return reply({ status: "sent" }, 200);
    deps.log("confirmation e-mail not sent", { status: sent.status });
  } catch (error) {
    deps.log("confirmation e-mail crashed", error instanceof Error ? error.message : error);
  }
  // Without the e-mail the visitor cannot confirm: say so, they can try again.
  return reply({ error: "server_error" }, 502);
}

/** Subscribes at once; the same answer whatever the address's state. */
async function direct(
  deps: SubscribeDeps,
  reply: (body: unknown, status: number) => Response,
  subscription: Subscription,
  method: DirectMethod,
): Promise<Response> {
  const result = await deps.subscribeDirect(subscription, method).catch((error) => ({
    error: { message: error instanceof Error ? error.message : String(error) } as DbError,
  }));
  if ("error" in result) {
    const { code, message } = result.error;
    if (code === "PT429") return reply({ error: "rate_limited" }, 429);
    if (code === "22023") return reply({ error: "invalid_request" }, 400);
    deps.log("newsletter_subscribe_direct failed", { code, message });
    return reply({ error: "server_error" }, 500);
  }
  return reply({ status: "subscribed" }, 200);
}
