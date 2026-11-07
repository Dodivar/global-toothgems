import { requireEnv, serviceClient } from "../_shared/clients.ts";
import { emailDepsFromEnv, sendTemplatedEmail } from "../_shared/email/mod.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { handleSubscribe, type SubscribeDeps } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): visitors call it with the publishable
 * key, which is not a JWT. Everything it does goes through the service role, after its own checks.
 */

const supabase = serviceClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));

const deps: SubscribeDeps = {
  origins,

  async ipAllowed(ipHash) {
    const { data, error } = await supabase.rpc("newsletter_ip_allowed", { p_ip_hash: ipHash });
    if (error) throw new Error(error.message);
    return data === true;
  },

  async subscribe(s) {
    const { data, error } = await supabase.rpc("newsletter_subscribe", {
      p_email: s.email,
      p_locale: s.locale,
      p_source: s.source,
      p_policy_version: s.policyVersion,
    });
    if (error) return { error: { code: error.code, message: error.message } };
    const row = (data ?? {}) as { status?: unknown; confirm_token?: unknown };
    return {
      status: typeof row.status === "string" ? row.status : "",
      confirmToken: typeof row.confirm_token === "string" ? row.confirm_token : null,
    };
  },

  sendEmail: (request) => sendTemplatedEmail(emailDepsFromEnv(), request),
  log: (message, detail) => console.error(`[newsletter-subscribe] ${message}`, detail ?? ""),
};

Deno.serve((req) => handleSubscribe(req, deps));
