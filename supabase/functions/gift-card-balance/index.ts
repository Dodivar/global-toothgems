import { requireEnv, serviceClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { functionLogger } from "../_shared/log.ts";
import { type BalanceDeps, handleBalance, readLookup } from "./handler.ts";

const log = functionLogger("gift-card-balance");

/*
 * Deployed with verify_jwt = false (supabase/config.toml): visitors call it with the publishable
 * key, which is not a JWT. Everything it does goes through the service role, after its own checks.
 * TURNSTILE_SECRET_KEY (the newsletter's and contact form's secret) makes the captcha mandatory.
 */

const supabase = serviceClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim() || null;

const deps: BalanceDeps = {
  origins,
  captchaConfigured: turnstileSecret !== null,
  verifyCaptcha: (token, remoteIp) => verifyTurnstile(turnstileSecret ?? "", token, remoteIp),

  async ipAllowed(ipHash) {
    const { data, error } = await supabase.rpc("gift_card_balance_ip_allowed", { p_ip_hash: ipHash });
    if (error) throw new Error(error.message);
    return data === true;
  },

  async lookup(code, ipHash) {
    const { data, error } = await supabase.rpc("check_gift_card_balance_for_visitor", { p_code: code, p_ip_hash: ipHash });
    if (error) throw new Error(error.message);
    return readLookup(data);
  },

  log,
};

Deno.serve((req) => handleBalance(req, deps));
