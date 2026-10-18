"use client";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase/client";
import { readWithdrawalQuote, readWithdrawAnswer, type WithdrawAnswer, type WithdrawalQuote } from "./studioWithdrawalMapping";

/**
 * The persistence boundary of the 3D Studio withdrawal (decision 95): the
 * member's own quote (`studio_withdrawal_quote()`, RLS: the signed-in account)
 * and the withdrawal itself (`studio-withdraw`). Nothing is decided here: the
 * database says whether the member may withdraw and how much comes back.
 */

export async function fetchWithdrawalQuote(): Promise<WithdrawalQuote> {
  if (!supabase) return { kind: "none" };
  const { data, error } = await supabase.rpc("studio_withdrawal_quote");
  if (error) throw new Error("studio_withdrawal_quote unavailable");
  return readWithdrawalQuote(data);
}

export async function withdrawFromStudio(): Promise<WithdrawAnswer> {
  if (!supabase) return { kind: "error" };
  const { data, error } = await supabase.functions.invoke("studio-withdraw", { body: {} });
  if (!error) return readWithdrawAnswer(200, data);
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    try {
      return readWithdrawAnswer(response.status, await response.json());
    } catch {
      return { kind: "error" };
    }
  }
  return { kind: "error" };
}
