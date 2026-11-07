import { corsHeaders, json, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import { hashAddress, isValidAddress, type SendRequest, type SendResult } from "../_shared/email/send.ts";
import type { EmailContent } from "../_shared/email/render.ts";

/**
 * POST /functions/v1/newsletter-subscribe — the storefront newsletter form's only way in.
 *
 *   browser ──(JSON: email, locale, source, policy_version, consent)──▶ this function
 *     1. validates the fields; the box the visitor ticked is required (explicit consent)
 *     2. throttles by caller address (newsletter_ip_allowed: 10 / hour); the database
 *        throttles by e-mail on top (3 / hour)
 *     3. newsletter_subscribe() as the service role → a token only when a confirmation
 *        e-mail must go out (new or pending address)
 *     4. e-mails the double opt-in link: <site>/newsletter/confirmer?token=…
 *
 * Why a function and not a Next.js route: newsletter_subscribe() is service role only and the
 * Next.js server must not hold that key (AGENTS.md §4). No captcha yet (provider to choose):
 * the honeypot field `website` and the two throttles stand in, as on the contact form.
 *
 * The visitor is answered the same way whatever the address's state (new, pending, already
 * subscribed, bounced, complained): `{ status: "sent" }`, so the form never tells whether an
 * address is on the list. Errors are `{ error }` with a short code.
 */

const SOURCES = ["home", "footer"] as const;
type Source = (typeof SOURCES)[number];

/** The form's body is a handful of short fields. */
const MAX_REQUEST_BYTES = 4 * 1024;
const POLICY_VERSION = /^[0-9A-Za-z._-]{1,40}$/;

export interface Subscription {
  email: string;
  locale: "fr" | "en";
  source: Source;
  policyVersion: string;
}

export type DbError = { code?: string; message?: string };

export interface SubscribeDeps {
  origins: SiteOrigins;
  /** False when this caller address has used up its attempts. */
  ipAllowed(ipHash: string): Promise<boolean>;
  /** newsletter_subscribe() as the service role: `{status, confirm_token?}` or the database error. */
  subscribe(subscription: Subscription): Promise<{ status: string; confirmToken: string | null } | { error: DbError }>;
  sendEmail(request: SendRequest): Promise<SendResult>;
  log(message: string, detail?: unknown): void;
}

function parseBody(raw: unknown): (Subscription & { honeypot: boolean }) | null {
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");
  const honeypot = str("website") !== "";
  const email = str("email").toLowerCase();
  const locale = str("locale") === "en" ? "en" : "fr";
  const source = str("source");
  const policyVersion = str("policy_version");
  if (body.consent !== true) return null;
  if (!isValidAddress(email)) return null;
  if (!(SOURCES as readonly string[]).includes(source)) return null;
  if (!POLICY_VERSION.test(policyVersion)) return null;
  return { email, locale, source: source as Source, policyVersion, honeypot };
}

/** Only the headers the platform sets itself: `x-forwarded-for` can be written by the caller. */
const clientAddress = (req: Request): string | null =>
  req.headers.get("sb-forwarded-for")?.trim() || req.headers.get("cf-connecting-ip")?.trim() || null;

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

  const { honeypot: _honeypot, ...subscription } = fields;
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
