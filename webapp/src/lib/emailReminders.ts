import { isSupabaseConfigured } from "./supabase/env";
import { requireSupabase } from "./supabase/client";

/**
 * The single persistence boundary of the reminder e-mails' opt-out (decision 142): the
 * abandoned cart, review request and loyalty reward e-mails carry
 * `/rappels/desinscription?token=…`; clicking the page's button calls
 * `unsubscribe_email_reminders(token)`, open to visitors. One switch per address, for all
 * three kinds; order e-mails are not affected.
 */

/** The shape of the token the reminder e-mails carry (48 hex characters). */
export const REMINDER_TOKEN_RE = /^[0-9a-f]{48}$/;

export type StopRemindersResult = "stopped" | "invalid" | "unavailable" | "error";

/** `stopped` also when the address had already stopped them; `invalid` for a token that matches nothing. */
export async function stopEmailReminders(token: string): Promise<StopRemindersResult> {
  if (!REMINDER_TOKEN_RE.test(token)) return "invalid";
  if (!isSupabaseConfigured) return "unavailable";
  const { data, error } = await requireSupabase().rpc("unsubscribe_email_reminders", { p_token: token });
  if (error) return "error";
  return data === true ? "stopped" : "invalid";
}
