import { callerJwt, corsHeaders, json, returnOrigin, type SiteOrigins } from "../_shared/http.ts";
import { hashAddress, isValidAddress } from "../_shared/email/send.ts";

/**
 * POST /functions/v1/order-withdrawal — the shop's online withdrawal function
 * (L221-21, decision 131). Three actions:
 *
 *   {action: "request_link", order_number, email, locale, captcha?, website?}
 *       A visitor without an account. Honeypot, 10 requests / hour / address,
 *       Turnstile once TURNSTILE_SECRET_KEY is set; then the database looks for a
 *       paid order with that number AND that e-mail (3 tries / hour / pair) and,
 *       when there is one, a link valid 48 hours is e-mailed to the ORDER's address.
 *       The answer is `{status: "sent"}` whatever the database found: the form
 *       never tells whether an order exists.
 *   {action: "options", token}
 *       The guest page opened from that link: what can be withdrawn (or 404).
 *   {action: "declare", order_id | token, customer_name, items[{order_item_id,
 *    quantity, seal_opened?}], as_consumer, locale}
 *       The confirmed declaration: a signed-in member (their JWT, their order) or
 *       a guest (the link's token). Every rule is checked by
 *       declare_order_withdrawal(); the acknowledgement e-mail leaves at once (the
 *       sweep catches a failure). Answer: {withdrawal: {id, declared_at}}.
 *
 * Why a function: the database calls are service role only (the token, the
 * guest's identity), and the Next.js server must not hold that key (AGENTS.md §4).
 * Errors are short codes; SQL messages are logged, never returned.
 */

export type DbError = { code?: string; message?: string };

export interface LinkResult {
  status: "ok" | "none" | "throttled";
  linkId?: string;
  token?: string;
  orderId?: string;
  orderNumber?: string;
  email?: string;
  locale?: string;
}

export interface DeclareInput {
  orderId: string | null;
  token: string | null;
  userId: string | null;
  customerName: string;
  items: { order_item_id: string; quantity: number; seal_opened?: boolean | null }[];
  asConsumer: boolean;
  locale: "fr" | "en";
}

export interface OrderWithdrawalDeps {
  origins: SiteOrigins;
  captchaConfigured: boolean;
  verifyCaptcha(token: string, remoteIp: string | null): Promise<boolean>;
  ipAllowed(ipHash: string): Promise<boolean>;
  userFromToken(token: string): Promise<string | null>;
  requestLink(orderNumber: string, email: string): Promise<LinkResult | { error: DbError }>;
  optionsByToken(token: string): Promise<unknown | null>;
  declare(input: DeclareInput): Promise<{ id: string; declaredAt: string } | { error: DbError }>;
  sendLinkEmail(args: { to: string; locale: string; orderNumber: string; orderId: string; linkId: string; url: string }): Promise<void>;
  acknowledge(withdrawalId: string): Promise<void>;
  log(message: string, detail?: unknown): void;
}

const MAX_BODY_BYTES = 16 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/;
const ORDER_NUMBER_RE = /^[A-Za-z0-9-]{3,40}$/;
const MAX_CAPTCHA = 2048;
const MAX_LINES = 100;

/** The public withdrawal page of each language (webapp/src/lib/localeRoutes.ts). */
export const WITHDRAWAL_PAGE = { fr: "/fr/retours-remboursements/retractation", en: "/en/returns/withdrawal" } as const;

/** Refusals of declare_order_withdrawal() the page explains. */
export const DECLARE_REFUSALS = [
  "not_paid",
  "professional",
  "deadline_passed",
  "professional_buyer",
  "excluded_line",
  "unsealed_hygiene",
  "quantity",
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (body: Record<string, unknown>, key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");

/** Only the headers the platform sets itself: `x-forwarded-for` can be written by the caller. */
const clientAddress = (req: Request): string | null =>
  req.headers.get("sb-forwarded-for")?.trim() || req.headers.get("cf-connecting-ip")?.trim() || null;

/** A database refusal as a short code and status. */
export function declareRefusal(error: DbError): { code: string; status: number } {
  const message = error.message ?? "";
  if (error.code === "42501") return { code: "not_allowed", status: 403 };
  if (error.code === "23514") {
    const code = /order_withdrawal: ([a-z_]+)/.exec(message)?.[1] ?? "";
    return (DECLARE_REFUSALS as readonly string[]).includes(code) ? { code, status: 409 } : { code: "refused", status: 409 };
  }
  if (error.code === "22023" || error.code === "22P02") {
    return /seal_answer_required/.test(message) ? { code: "seal_answer_required", status: 400 } : { code: "invalid_request", status: 400 };
  }
  return { code: "server_error", status: 500 };
}

export function parseItems(raw: unknown): DeclareInput["items"] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_LINES) return null;
  const items: DeclareInput["items"] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.order_item_id !== "string" || !UUID_RE.test(entry.order_item_id)) return null;
    const quantity = entry.quantity;
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10_000) return null;
    const opened = entry.seal_opened;
    if (opened !== undefined && opened !== null && typeof opened !== "boolean") return null;
    const id = entry.order_item_id.toLowerCase();
    if (seen.has(id)) return null;
    seen.add(id);
    items.push({ order_item_id: id, quantity, ...(typeof opened === "boolean" ? { seal_opened: opened } : {}) });
  }
  return items;
}

export async function handleOrderWithdrawal(req: Request, deps: OrderWithdrawalDeps): Promise<Response> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(deps.origins, origin);
  const reply = (body: unknown, status: number) => json(body, status, cors);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "invalid_request" }, 405, { ...cors, Allow: "POST, OPTIONS" });
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return reply({ error: "invalid_request" }, 413);

  let body: unknown;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return reply({ error: "invalid_request" }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "invalid_request" }, 400);
  }
  if (!isRecord(body)) return reply({ error: "invalid_request" }, 400);

  try {
    switch (body.action) {
      case "request_link":
        return await requestLink(req, body, deps, reply, returnOrigin(deps.origins, origin));
      case "options":
        return await options(body, deps, reply);
      case "declare":
        return await declare(req, body, deps, reply);
      default:
        return reply({ error: "invalid_request" }, 400);
    }
  } catch (error) {
    deps.log("unexpected failure", error instanceof Error ? error.message : error);
    return reply({ error: "server_error" }, 500);
  }
}

type Reply = (body: unknown, status: number) => Response;

async function requestLink(
  req: Request,
  body: Record<string, unknown>,
  deps: OrderWithdrawalDeps,
  reply: Reply,
  site: string,
): Promise<Response> {
  const orderNumber = str(body, "order_number").toUpperCase();
  const email = str(body, "email").toLowerCase();
  const locale = str(body, "locale") === "en" ? "en" : "fr";
  const captcha = str(body, "captcha");
  if (!ORDER_NUMBER_RE.test(orderNumber) || !isValidAddress(email) || captcha.length > MAX_CAPTCHA) {
    return reply({ error: "invalid_request" }, 400);
  }
  // Honeypot: a field no person sees. A bot that fills it is told all went well.
  if (str(body, "website") !== "") return reply({ status: "sent" }, 200);

  const ip = clientAddress(req);
  if (ip && !(await deps.ipAllowed(await hashAddress(ip)))) return reply({ error: "rate_limited" }, 429);

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
  }

  const result = await deps.requestLink(orderNumber, email);
  if ("error" in result) {
    if (result.error.code === "22023") return reply({ error: "invalid_request" }, 400);
    deps.log("request_order_withdrawal_link failed", result.error);
    return reply({ error: "server_error" }, 500);
  }
  if (result.status === "ok" && result.token && result.email && result.linkId && result.orderId) {
    const lang = result.locale === "en" ? "en" : locale;
    const url = `${site}${WITHDRAWAL_PAGE[lang]}#t=${result.token}`;
    try {
      await deps.sendLinkEmail({
        to: result.email,
        locale: lang,
        orderNumber: result.orderNumber ?? orderNumber,
        orderId: result.orderId,
        linkId: result.linkId,
        url,
      });
    } catch (error) {
      // The visitor may ask again; the answer stays the same.
      deps.log("link e-mail failed", error instanceof Error ? error.message : error);
    }
  }
  return reply({ status: "sent" }, 200);
}

async function options(body: Record<string, unknown>, deps: OrderWithdrawalDeps, reply: Reply): Promise<Response> {
  const token = str(body, "token");
  if (!TOKEN_RE.test(token)) return reply({ error: "link_invalid" }, 404);
  const overview = await deps.optionsByToken(token);
  if (!overview) return reply({ error: "link_invalid" }, 404);
  return reply({ options: overview }, 200);
}

async function declare(req: Request, body: Record<string, unknown>, deps: OrderWithdrawalDeps, reply: Reply): Promise<Response> {
  const customerName = str(body, "customer_name");
  const items = parseItems(body.items);
  if (!customerName || customerName.length > 200 || !items || typeof body.as_consumer !== "boolean") {
    return reply({ error: "invalid_request" }, 400);
  }
  const locale = str(body, "locale") === "en" ? "en" : "fr";

  let orderId: string | null = null;
  let token: string | null = null;
  let userId: string | null = null;
  if (typeof body.token === "string" && body.token) {
    if (!TOKEN_RE.test(body.token)) return reply({ error: "link_invalid" }, 404);
    token = body.token;
    // The link names its order; the overview tells which one.
    const overview = await deps.optionsByToken(token);
    const id = isRecord(overview) && typeof overview.order_id === "string" ? overview.order_id : null;
    if (!id) return reply({ error: "link_invalid" }, 404);
    orderId = id;
  } else {
    const jwt = callerJwt(req);
    if (!jwt) return reply({ error: "sign_in_required" }, 401);
    if (typeof body.order_id !== "string" || !UUID_RE.test(body.order_id)) return reply({ error: "invalid_request" }, 400);
    userId = await deps.userFromToken(jwt);
    if (!userId) return reply({ error: "session_expired" }, 401);
    orderId = body.order_id.toLowerCase();
  }

  const result = await deps.declare({ orderId, token, userId, customerName, items, asConsumer: body.as_consumer, locale });
  if ("error" in result) {
    const refusal = declareRefusal(result.error);
    if (refusal.code === "server_error") deps.log("declare_order_withdrawal failed", result.error);
    return reply({ error: refusal.code }, refusal.status);
  }

  try {
    await deps.acknowledge(result.id);
  } catch (error) {
    // Recorded: the 5-minute sweep sends the acknowledgement.
    deps.log("acknowledgement failed", error instanceof Error ? error.message : error);
  }
  return reply({ withdrawal: { id: result.id, declared_at: result.declaredAt } }, 200);
}
