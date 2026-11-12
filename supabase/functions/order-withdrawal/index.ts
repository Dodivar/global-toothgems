import { requireEnv, serviceClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { emailDepsFromEnv, sendTemplatedEmail } from "../_shared/email/mod.ts";
import {
  sendOrderWithdrawalEmails,
  supabaseWithdrawalSource,
  withdrawalLinkContent,
} from "../_shared/email/withdrawalEmails.ts";
import { verifyTurnstile } from "../_shared/turnstile.ts";
import { handleOrderWithdrawal, type LinkResult, type OrderWithdrawalDeps } from "./handler.ts";
import { functionLogger } from "../_shared/log.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): guests call it with the
 * publishable key, which is not a JWT; a member's token is verified here
 * (auth.getUser). Database calls are made as the service role after these checks.
 * TURNSTILE_SECRET_KEY (shared with newsletter-subscribe) makes the captcha
 * mandatory for the guest link.
 */

const supabase = serviceClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY")?.trim() || null;
const log = functionLogger("order-withdrawal");

const deps: OrderWithdrawalDeps = {
  origins,
  captchaConfigured: turnstileSecret !== null,
  verifyCaptcha: (token, remoteIp) => verifyTurnstile(turnstileSecret ?? "", token, remoteIp),

  async ipAllowed(ipHash) {
    const { data, error } = await supabase.rpc("order_withdrawal_ip_allowed", { p_ip_hash: ipHash });
    if (error) throw new Error(error.message);
    return data === true;
  },

  async userFromToken(token) {
    const { data, error } = await supabase.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },

  async requestLink(orderNumber, email) {
    const { data, error } = await supabase.rpc("request_order_withdrawal_link", {
      p_order_number: orderNumber,
      p_email: email,
    });
    if (error) return { error: { code: error.code, message: error.message } };
    const row = (data ?? {}) as Record<string, unknown>;
    const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : undefined);
    return {
      status: (text("status") ?? "none") as LinkResult["status"],
      linkId: text("link_id"),
      token: text("token"),
      orderId: text("order_id"),
      orderNumber: text("order_number"),
      email: text("email"),
      locale: text("locale"),
    };
  },

  async optionsByToken(token) {
    const { data, error } = await supabase.rpc("order_withdrawal_options_by_token", { p_token: token });
    if (error) throw new Error(error.message);
    return data ?? null;
  },

  async declare(input) {
    const { data, error } = await supabase.rpc("declare_order_withdrawal", {
      p_order_id: input.orderId,
      p_customer_name: input.customerName,
      p_items: input.items,
      p_as_consumer: input.asConsumer,
      p_user_id: input.userId,
      p_link_token: input.token,
      p_locale: input.locale,
    });
    if (error) return { error: { code: error.code, message: error.message } };
    const row = (data ?? {}) as { id?: string; declared_at?: string };
    return { id: String(row.id), declaredAt: String(row.declared_at) };
  },

  async sendLinkEmail({ to, locale, orderNumber, orderId, linkId, url }) {
    const result = await sendTemplatedEmail(emailDepsFromEnv(), {
      templateKey: "order_withdrawal_link",
      to,
      locale,
      variables: { order_number: orderNumber },
      eventKey: `order_withdrawal_link:${linkId}`,
      orderId,
      content: (found) => withdrawalLinkContent(url, found),
    });
    if (result.status === "failed") throw new Error(result.error);
  },

  async acknowledge(withdrawalId) {
    await sendOrderWithdrawalEmails(emailDepsFromEnv(), supabaseWithdrawalSource(supabase), {
      limit: 100,
      log,
      only: withdrawalId,
    });
  },

  log,
};

Deno.serve((req) => handleOrderWithdrawal(req, deps));
