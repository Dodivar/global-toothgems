import { callerClient, requireEnv, serviceClient, stripeClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { toDecimalString } from "../_shared/money.ts";
import { handleRefundOrder, stripeReason, type RefundDeps, type RefundRow } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml), like invite-staff-member:
 * the caller's JWT is checked here and the database enforces `manage_orders`.
 */

const service = serviceClient();
const stripe = stripeClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));

interface Row {
  id: string;
  payment_id: string;
  status: string;
  provider_refund_id: string | null;
}

const toRow = (row: Row): RefundRow => ({
  id: row.id,
  paymentId: row.payment_id,
  status: row.status,
  providerRefundId: row.provider_refund_id,
});

const deps: RefundDeps = {
  origins,

  async caller(token) {
    const { data, error } = await service.auth.getUser(token);
    if (error || !data.user) return null;
    const permissions = await callerClient(token).rpc("my_permissions");
    if (permissions.error) throw new Error(permissions.error.message);
    return { userId: data.user.id, permissions: new Set((permissions.data ?? []) as string[]) };
  },

  async requestRefund(token, input) {
    const { data, error } = await callerClient(token).rpc("request_refund", {
      p_order_id: input.order_id,
      p_amount: toDecimalString(input.amount_minor),
      p_reason: input.reason,
      p_items: input.items,
      p_restock: input.restock,
    });
    if (error) return { error: { code: error.code, message: error.message } };
    return { refund: toRow(data as Row) };
  },

  async paymentIntentOf(paymentId) {
    const { data, error } = await service.from("payments").select("provider_payment_id").eq("id", paymentId).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.provider_payment_id ?? null;
  },

  async createStripeRefund({ paymentIntentId, amountMinor, refundId, orderId, reason }) {
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntentId,
          amount: amountMinor,
          reason: stripeReason(reason),
          metadata: { refund_id: refundId, order_id: orderId },
        },
        { idempotencyKey: `refund:${refundId}` },
      );
      return { ok: true, providerRefundId: refund.id, status: refund.status };
    } catch (error) {
      const type = (error as { type?: string })?.type ?? "";
      const code = (error as { code?: string })?.code ?? type;
      // Stripe answered with a refusal (invalid request, card error, permission): final.
      // Anything else (network, timeout, 5xx, rate limit) leaves the outcome unknown.
      const definite = type === "StripeInvalidRequestError" || type === "StripeCardError" || type === "StripePermissionError";
      console.error("[refund-order] stripe refund failed", { type, code, message: (error as Error)?.message });
      return definite ? { ok: false, definite: true, code: code || "refused" } : { ok: false, definite: false };
    }
  },

  async saveProviderRefundId(refundId, providerRefundId) {
    const { error } = await service
      .from("refunds")
      .update({ provider_refund_id: providerRefundId })
      .eq("id", refundId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
  },

  async markFailed(refundId, reason) {
    const { error } = await service.rpc("mark_refund_failed", { p_refund_id: refundId, p_reason: reason });
    if (error) console.error("[refund-order] mark_refund_failed", error.message);
  },

  async findRefund(refundId) {
    const { data, error } = await service
      .from("refunds")
      .select("id, payment_id, status, provider_refund_id")
      .eq("id", refundId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toRow(data as Row) : null;
  },

  async cancelAsCaller(token, refundId) {
    const { error } = await callerClient(token)
      .from("refunds")
      .update({ status: "cancelled" })
      .eq("id", refundId)
      .eq("status", "pending")
      .select("id")
      .single();
    return error ? { code: error.code === "PGRST116" ? "42501" : error.code, message: error.message } : null;
  },

  log: (message, detail) => console.error(`[refund-order] ${message}`, detail ?? ""),
};

Deno.serve((req) => handleRefundOrder(req, deps));
