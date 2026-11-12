"use client";

import { readFunctionFailure } from "./supabase/functionError";
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
  const failure = await readFunctionFailure(error);
  if (failure.kind === "http" && failure.body !== undefined) return readWithdrawAnswer(failure.status, failure.body);
  return { kind: "error" };
}
