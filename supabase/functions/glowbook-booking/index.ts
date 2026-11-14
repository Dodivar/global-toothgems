import { requireEnv, serviceClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { emailDepsFromEnv } from "../_shared/email/mod.ts";
import { sendGlowbookBookingEmails, supabaseBookingMailSource } from "../_shared/email/glowbookBookingEmails.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { functionLogger } from "../_shared/log.ts";
import { type GlowbookBookingDeps, handleGlowbookBooking } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml), like the other browser-called
 * functions: the member's token is verified here (auth.getUser) and the booking is made as the
 * service role after the checks. TURNSTILE_SECRET_KEY (shared with the contact form) makes the
 * captcha mandatory.
 */

const supabase = serviceClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim() || null;
const log = functionLogger("glowbook-booking");

const deps: GlowbookBookingDeps = {
  origins,
  captchaConfigured: turnstileSecret !== null,
  verifyCaptcha: (token, remoteIp) => verifyTurnstile(turnstileSecret ?? "", token, remoteIp),

  async ipAllowed(ipHash) {
    const { data, error } = await supabase.rpc("glowbook_booking_ip_allowed", { p_ip_hash: ipHash });
    if (error) throw new Error(error.message);
    return data === true;
  },

  async userFromToken(token) {
    const { data, error } = await supabase.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },

  async book(input) {
    const { data, error } = await supabase.rpc("glowbook_book_slot", {
      p_client: input.clientId,
      p_handle: input.handle,
      p_starts_at: input.startsAt,
      p_item_id: input.itemId,
      p_name: input.name,
      p_phone: input.phone,
      p_comment: input.comment,
      p_locale: input.locale,
    });
    if (error) return { error: { code: error.code, message: error.message } };
    const row = (data ?? {}) as Record<string, unknown>;
    return { id: String(row.id), startsAt: String(row.starts_at), endsAt: String(row.ends_at), timezone: String(row.timezone) };
  },

  async notify(bookingId) {
    await sendGlowbookBookingEmails(emailDepsFromEnv(), supabaseBookingMailSource(supabase), { limit: 10, log, only: bookingId });
  },

  log,
};

Deno.serve((req) => handleGlowbookBooking(req, deps));
