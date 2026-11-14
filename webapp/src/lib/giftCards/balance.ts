"use client";

import { isSupabaseConfigured, supabase } from "../supabase/client";
import { functionErrorCode, readFunctionFailure } from "../supabase/functionError";
import { type BalanceOutcome, normaliseBalanceCode, readMemberAnswer, readVisitorAnswer, readVisitorError } from "./balanceMapping";

/**
 * The persistence boundary of the gift card balance check (decision 140).
 *
 *   member:   check_gift_card_balance(code) with their own session (throttled per account)
 *   visitor:  Edge Function `gift-card-balance` (honeypot, address limit, Turnstile)
 *
 * The code stays in memory: never stored, never put in an address or an analytics event.
 * Without Supabase (mock mode) nothing is checked: there is no simulated balance.
 */

/** From the build's variables, not the browser client (null on the server): the same on both sides of hydration. */
export const balanceCheckAvailable = (): boolean => isSupabaseConfigured;

export async function checkBalanceAsMember(rawCode: string): Promise<BalanceOutcome> {
  const code = normaliseBalanceCode(rawCode);
  if (!code) return { kind: "error", error: "invalid" };
  if (!supabase) return { kind: "error", error: "unavailable" };
  const { data, error } = await supabase.rpc("check_gift_card_balance", { p_code: code });
  if (error) return { kind: "error", error: "unavailable" };
  return readMemberAnswer(data);
}

export async function checkBalanceAsVisitor(
  rawCode: string,
  extra: { captcha?: string | null; website?: string } = {},
): Promise<BalanceOutcome> {
  const code = normaliseBalanceCode(rawCode);
  if (!code) return { kind: "error", error: "invalid" };
  if (!supabase) return { kind: "error", error: "unavailable" };
  const { data, error } = await supabase.functions.invoke("gift-card-balance", {
    body: {
      code,
      ...(extra.captcha ? { captcha: extra.captcha } : {}),
      ...(extra.website ? { website: extra.website } : {}),
    },
  });
  if (error) {
    const failure = await readFunctionFailure(error);
    return { kind: "error", error: failure.kind === "http" ? readVisitorError(functionErrorCode(failure.body)) : "unavailable" };
  }
  return readVisitorAnswer(data);
}
