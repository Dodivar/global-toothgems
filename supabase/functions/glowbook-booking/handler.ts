import { callerJwt, clientAddress, corsHeaders, json, type SiteOrigins } from "../_shared/http.ts";
import { hashAddress } from "../_shared/email/send.ts";

/**
 * POST /functions/v1/glowbook-booking — a signed-in member books one hour on an
 * artist's Glowbook (decision 144).
 *
 *   {handle, starts_at, item_id?, name, phone, comment?, locale, captcha?, website?}
 *
 * Checks, in order: a member session (their JWT, verified here), the honeypot,
 * 20 requests / hour / address, Cloudflare Turnstile once TURNSTILE_SECRET_KEY
 * is set; then glowbook_book_slot() (service role) checks every booking rule —
 * page open, hour free, limits, blocks, ban — and locks the hour. The booking and
 * confirmation e-mails leave at once (the sweep catches a failure).
 *
 * Answer: {booking: {id, starts_at, ends_at, timezone}}, or {error: <code>}.
 * Errors are short codes; SQL messages are logged, never returned.
 */

export type DbError = { code?: string; message?: string };

export interface BookInput {
  clientId: string;
  handle: string;
  startsAt: string;
  itemId: string | null;
  name: string;
  phone: string;
  comment: string | null;
  locale: "fr" | "en";
}

export interface BookedSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
}

export interface GlowbookBookingDeps {
  origins: SiteOrigins;
  captchaConfigured: boolean;
  verifyCaptcha(token: string, remoteIp: string | null): Promise<boolean>;
  ipAllowed(ipHash: string): Promise<boolean>;
  userFromToken(token: string): Promise<string | null>;
  book(input: BookInput): Promise<BookedSlot | { error: DbError }>;
  notify(bookingId: string): Promise<void>;
  log(message: string, detail?: unknown): void;
}

const MAX_BODY_BYTES = 8 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE_RE = /^[a-z0-9._-]{3,30}$/;
const PHONE_RE = /^\+?[0-9 ().-]{6,24}$/;
const MAX_CAPTCHA = 2048;

/** The refusals of glowbook_book_slot() the dialog explains. */
export const BOOKING_REFUSALS = [
  "closed",
  "own_calendar",
  "slot_unavailable",
  "slot_taken",
  "limit_artist",
  "limit_total",
  "limit_daily",
  "banned",
  "blocked",
  "comment_required",
  "item_unavailable",
] as const;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (body: Record<string, unknown>, key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : "");

/** A database refusal as a short code and an HTTP status. */
export function bookingRefusal(error: DbError): { code: string; status: number } {
  const code = /glowbook_booking: ([a-z_]+)/.exec(error.message ?? "")?.[1] ?? "";
  if (error.code === "42501") return code === "email_unconfirmed" ? { code, status: 403 } : { code: "not_allowed", status: 403 };
  if (error.code === "23514") {
    return (BOOKING_REFUSALS as readonly string[]).includes(code) ? { code, status: 409 } : { code: "refused", status: 409 };
  }
  if (error.code === "22023" || error.code === "22P02") return { code: "invalid_request", status: 400 };
  return { code: "server_error", status: 500 };
}

/** The request's fields, validated; null when anything is off. */
export function parseBooking(body: Record<string, unknown>): Omit<BookInput, "clientId"> | null {
  const handle = str(body, "handle").toLowerCase();
  const startsAt = str(body, "starts_at");
  const name = str(body, "name");
  const phone = str(body, "phone");
  const comment = str(body, "comment");
  const itemRaw = body.item_id;
  const date = new Date(startsAt);
  if (!HANDLE_RE.test(handle) || !startsAt || Number.isNaN(date.getTime()) || startsAt.length > 40) return null;
  if (name.length < 1 || name.length > 120 || !PHONE_RE.test(phone) || comment.length > 1000) return null;
  if (itemRaw !== undefined && itemRaw !== null && (typeof itemRaw !== "string" || !UUID_RE.test(itemRaw))) return null;
  return {
    handle,
    startsAt: date.toISOString(),
    itemId: typeof itemRaw === "string" ? itemRaw.toLowerCase() : null,
    name,
    phone,
    comment: comment || null,
    locale: str(body, "locale") === "en" ? "en" : "fr",
  };
}

export async function handleGlowbookBooking(req: Request, deps: GlowbookBookingDeps): Promise<Response> {
  const cors = corsHeaders(deps.origins, req.headers.get("origin"));
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
    const jwt = callerJwt(req);
    if (!jwt) return reply({ error: "sign_in_required" }, 401);
    const input = parseBooking(body);
    const captcha = str(body, "captcha");
    if (!input || captcha.length > MAX_CAPTCHA) return reply({ error: "invalid_request" }, 400);
    // Honeypot: a field no person sees.
    if (str(body, "website") !== "") return reply({ error: "invalid_request" }, 400);

    const clientId = await deps.userFromToken(jwt);
    if (!clientId) return reply({ error: "session_expired" }, 401);

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

    const result = await deps.book({ clientId, ...input });
    if ("error" in result) {
      const refusal = bookingRefusal(result.error);
      if (refusal.code === "server_error") deps.log("glowbook_book_slot failed", result.error);
      return reply({ error: refusal.code }, refusal.status);
    }

    try {
      await deps.notify(result.id);
    } catch (error) {
      // Recorded: the 5-minute sweep sends them.
      deps.log("booking e-mails failed", error instanceof Error ? error.message : error);
    }
    return reply({ booking: { id: result.id, starts_at: result.startsAt, ends_at: result.endsAt, timezone: result.timezone } }, 200);
  } catch (error) {
    deps.log("unexpected failure", error instanceof Error ? error.message : error);
    return reply({ error: "server_error" }, 500);
  }
}
