import "server-only";
import { supabaseUrl } from "./supabase/env";
import { sendVisitorEmail, type VisitorEmail, type VisitorEmailConfig, type VisitorEmailOutcome } from "./visitorEmail";

/*
 * Server-side entry point for the visitor-form e-mails. Reads
 * `EMAIL_INTERNAL_SECRET` (never NEXT_PUBLIC_) and the Edge Functions address:
 * `SUPABASE_FUNCTIONS_URL` when set, else `<NEXT_PUBLIC_SUPABASE_URL>/functions/v1`.
 * Without the secret the e-mail is skipped ("unavailable"), like the Edge
 * Functions do without RESEND_API_KEY.
 */

function readConfig(): VisitorEmailConfig | null {
  const secret = process.env.EMAIL_INTERNAL_SECRET?.trim();
  const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL?.trim() || (supabaseUrl ? `${supabaseUrl}/functions/v1` : "");
  return secret && functionsUrl ? { secret, functionsUrl } : null;
}

export async function sendVisitorEmailFromServer(email: VisitorEmail): Promise<VisitorEmailOutcome> {
  const config = readConfig();
  return config ? await sendVisitorEmail(config, email) : "unavailable";
}
