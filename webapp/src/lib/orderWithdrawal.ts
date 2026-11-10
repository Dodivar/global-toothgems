"use client";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";
import {
  type DeclareError,
  itemsPayload,
  type LineChoice,
  readDeclareError,
  readWithdrawalOptions,
  type WithdrawalLine,
  type WithdrawalOptions,
  type WithdrawalRefusalReason,
} from "./orderWithdrawalMapping";

/**
 * The persistence boundary of the shop's withdrawal function (decision 131).
 *
 *   member:  order_withdrawal_options(order) through RLS-checked RPC, then the
 *            Edge Function `order-withdrawal` (their JWT) to declare
 *   guest:   `order-withdrawal` request_link → e-mailed link → options / declare
 *            with the link's token
 *   staff:   order_withdrawal_options (staff view), admin_withdrawal_return_received,
 *            admin_refuse_withdrawal; the refund goes through `refund-order`
 *            (lib/adminFulfillment.ts) with the withdrawal id
 *
 * Without Supabase (mock mode) nothing is offered: there is no simulated withdrawal.
 */

export const withdrawalAvailable = (): boolean => supabase !== null;

async function functionError(error: unknown): Promise<DeclareError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await (error.context as Response).json()) as { error?: unknown };
      return readDeclareError(body.error);
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}

/** The member's (or a staff member's) view of one order, by its id. */
export async function fetchWithdrawalOptions(orderId: string): Promise<WithdrawalOptions | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("order_withdrawal_options", { p_order_id: orderId });
  // Before migration 20261109213000 reaches a project the function does not exist: offer nothing.
  if (error?.code === "PGRST202") return null;
  if (error) throw new Error("order_withdrawal_options unavailable");
  return readWithdrawalOptions(data);
}

/** An order's id from its reference (RLS: a member's own orders, every order for staff). */
export async function findOrderId(reference: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("orders").select("id").eq("order_number", reference).maybeSingle();
  if (error) throw new Error("order lookup unavailable");
  return data?.id ?? null;
}

export interface Declaration {
  customerName: string;
  lines: WithdrawalLine[];
  choices: Record<string, LineChoice>;
  asConsumer: boolean;
  locale: "fr" | "en";
}

export type DeclareAnswer = { kind: "declared"; id: string; declaredAt: string } | { kind: "error"; error: DeclareError };

async function declare(target: { order_id: string } | { token: string }, declaration: Declaration): Promise<DeclareAnswer> {
  if (!supabase) return { kind: "error", error: "unavailable" };
  const { data, error } = await supabase.functions.invoke("order-withdrawal", {
    body: {
      action: "declare",
      ...target,
      customer_name: declaration.customerName.trim(),
      items: itemsPayload(declaration.lines, declaration.choices),
      as_consumer: declaration.asConsumer,
      locale: declaration.locale,
    },
  });
  if (error) return { kind: "error", error: await functionError(error) };
  const row = (data as { withdrawal?: { id?: unknown; declared_at?: unknown } } | null)?.withdrawal;
  if (!row || typeof row.id !== "string") return { kind: "error", error: "unavailable" };
  return { kind: "declared", id: row.id, declaredAt: typeof row.declared_at === "string" ? row.declared_at : new Date().toISOString() };
}

export const declareAsMember = (orderId: string, declaration: Declaration) => declare({ order_id: orderId }, declaration);
export const declareWithLink = (token: string, declaration: Declaration) => declare({ token }, declaration);

export type LinkAnswer = { kind: "sent" } | { kind: "error"; error: DeclareError };

export async function requestWithdrawalLink(input: {
  orderNumber: string;
  email: string;
  locale: "fr" | "en";
  captcha?: string | null;
  website?: string;
}): Promise<LinkAnswer> {
  if (!supabase) return { kind: "error", error: "unavailable" };
  const { error } = await supabase.functions.invoke("order-withdrawal", {
    body: {
      action: "request_link",
      order_number: input.orderNumber.trim(),
      email: input.email.trim(),
      locale: input.locale,
      ...(input.captcha ? { captcha: input.captcha } : {}),
      ...(input.website ? { website: input.website } : {}),
    },
  });
  if (error) return { kind: "error", error: await functionError(error) };
  return { kind: "sent" };
}

export type LinkOptions = { kind: "ok"; options: WithdrawalOptions } | { kind: "invalid" } | { kind: "error" };

export async function fetchOptionsWithLink(token: string): Promise<LinkOptions> {
  if (!supabase) return { kind: "error" };
  const { data, error } = await supabase.functions.invoke("order-withdrawal", { body: { action: "options", token } });
  if (error) return (await functionError(error)) === "link_invalid" ? { kind: "invalid" } : { kind: "error" };
  const options = readWithdrawalOptions((data as { options?: unknown } | null)?.options);
  return options ? { kind: "ok", options } : { kind: "error" };
}

export type StaffAnswer = { ok: true } | { ok: false; reason: "forbidden" | "settled" | "invalid" | "unavailable" };

function staffError(error: { code?: string } | null): StaffAnswer {
  if (!error) return { ok: true };
  if (error.code === "42501") return { ok: false, reason: "forbidden" };
  if (error.code === "23514") return { ok: false, reason: "settled" };
  if (error.code === "22023") return { ok: false, reason: "invalid" };
  return { ok: false, reason: "unavailable" };
}

export async function markReturnReceived(withdrawalId: string): Promise<StaffAnswer> {
  if (!supabase) return { ok: false, reason: "unavailable" };
  const { error } = await supabase.rpc("admin_withdrawal_return_received", { p_withdrawal_id: withdrawalId });
  if (error) console.error("[withdrawal] return received refused", error.code);
  return staffError(error);
}

export async function refuseWithdrawal(withdrawalId: string, reason: WithdrawalRefusalReason, note: string): Promise<StaffAnswer> {
  if (!supabase) return { ok: false, reason: "unavailable" };
  const { error } = await supabase.rpc("admin_refuse_withdrawal", {
    p_withdrawal_id: withdrawalId,
    p_reason: reason,
    p_note: note.trim() || undefined,
  });
  if (error) console.error("[withdrawal] refusal refused", error.code);
  return staffError(error);
}
