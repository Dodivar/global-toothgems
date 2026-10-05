import { hasInternalSecret } from "../_shared/internalAuth.ts";
import { json, readJson } from "../_shared/http.ts";
import { isValidAddress, type SendRequest, type SendResult } from "../_shared/email/send.ts";

/**
 * POST /functions/v1/send-email — e-mails one visitor-form message on behalf of
 * the Next.js server routes: the contact acknowledgement and the newsletter
 * double opt-in link. Nothing else can be sent through it.
 *
 * Deployed with verify_jwt = false (supabase/config.toml): the caller is the
 * webapp's server, not a browser. Authentication is the shared secret
 * EMAIL_INTERNAL_SECRET in the `x-internal-secret` header.
 *
 * Body: { template_key, to, locale, variables, event_key }. Every field is
 * checked here, whatever the caller is supposed to have checked: the template
 * is on an allow-list, each template accepts exactly its own variables (short
 * strings), the event key carries the template's prefix, and the newsletter
 * link must point at the site itself.
 * Answers: { ok: true, status: "sent" | "duplicate" } — never the e-mail's
 * content, never the provider's error text.
 */

interface TemplateRule {
  /** Exactly these variables, no more, no fewer. */
  variables: Record<string, { max: number; siteLink?: boolean }>;
}

const ALLOWED: Record<string, TemplateRule> = {
  contact_acknowledgement: {
    variables: { name: { max: 120 }, subject: { max: 200 }, ticket_number: { max: 40 } },
  },
  newsletter_confirmation: {
    variables: { confirm_url: { max: 500, siteLink: true } },
  },
};

const LOCALES = new Set(["fr", "en", "de"]);
const MAX_BODY_BYTES = 8 * 1024;
const EVENT_KEY = /^[a-z_]+:[A-Za-z0-9._-]{1,150}$/;

export interface SendEmailDeps {
  /** EMAIL_INTERNAL_SECRET */
  secret: string | undefined;
  /** Production origin: the newsletter confirmation link must start with it. */
  siteUrl: string | null;
  send(request: SendRequest): Promise<SendResult>;
  log(message: string, detail?: unknown): void;
}

function parseRequest(raw: unknown, siteUrl: string | null): SendRequest | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const { template_key: templateKey, to, locale, variables, event_key: eventKey } = body;

  if (typeof templateKey !== "string" || !Object.hasOwn(ALLOWED, templateKey)) return null;
  if (typeof to !== "string" || !isValidAddress(to.trim())) return null;
  if (typeof locale !== "string" || !LOCALES.has(locale)) return null;
  if (typeof eventKey !== "string" || !EVENT_KEY.test(eventKey) || !eventKey.startsWith(`${templateKey}:`)) return null;
  if (variables === null || typeof variables !== "object" || Array.isArray(variables)) return null;

  const rule = ALLOWED[templateKey];
  const given = variables as Record<string, unknown>;
  const names = Object.keys(given);
  if (names.length !== Object.keys(rule.variables).length) return null;
  const clean: Record<string, string> = {};
  for (const name of names) {
    const spec = Object.hasOwn(rule.variables, name) ? rule.variables[name] : undefined;
    const value = given[name];
    if (!spec || typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > spec.max) return null;
    if (spec.siteLink && (!siteUrl || !trimmed.startsWith(`${siteUrl}/`) || /[\s<>"']/.test(trimmed))) return null;
    clean[name] = trimmed;
  }
  return { templateKey, to: to.trim(), locale, variables: clean, eventKey };
}

export async function handleSendEmail(req: Request, deps: SendEmailDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await hasInternalSecret(req, deps.secret))) return json({ error: "unauthorized" }, 401);

  const parsed = parseRequest(await readJson(req, MAX_BODY_BYTES), deps.siteUrl);
  if (!parsed) return json({ error: "invalid_request" }, 400);

  try {
    const result = await deps.send(parsed);
    switch (result.status) {
      case "sent":
        return json({ ok: true, status: "sent" }, 200);
      case "duplicate":
        // Already sent (or being sent): the caller's retry is harmless.
        return json({ ok: true, status: "duplicate" }, 200);
      case "invalid":
        deps.log("send-email: e-mail refused as invalid", { template: parsed.templateKey, event: parsed.eventKey });
        return json({ error: "invalid_request" }, 400);
      case "template_missing":
        deps.log("send-email: template missing", parsed.templateKey);
        return json({ error: "unavailable" }, 503);
      case "failed":
        deps.log("send-email: provider error", { template: parsed.templateKey, retryable: result.retryable });
        return json({ error: "send_failed", retryable: result.retryable }, result.retryable ? 503 : 502);
    }
  } catch (error) {
    deps.log("send-email: crashed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500);
  }
}
