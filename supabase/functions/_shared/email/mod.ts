/**
 * Entry point of the e-mail module (decision 79): what the Edge Functions import.
 *
 * Functions import `emailDepsFromEnv` and `sendTemplatedEmail` from this module, then call
 * `sendTemplatedEmail(emailDepsFromEnv(), { templateKey: "order_confirmation", … })`.
 * (No import line in this comment: the Supabase CLI scans comments for import paths and warns
 * when one does not resolve from this file.)
 */
import { requireEnv, serviceClient } from "../clients.ts";
import { parseOrigin } from "../http.ts";
import { supabaseEmailStore } from "./store.ts";
import type { EmailDeps } from "./send.ts";

export { sendTemplatedEmail } from "./send.ts";
export type { EmailDeps, EmailStore, SendRequest, SendResult } from "./send.ts";
export { EmailRenderError, renderEmail } from "./render.ts";

/** The brand name shown in the layout header and footer. */
const BRAND_NAME = "Global Tooth Gems";

/** Reads the secrets from the function environment (names in functions/.env.example). */
export function emailDepsFromEnv(): EmailDeps {
  const siteUrl = parseOrigin(Deno.env.get("SITE_URL"));
  if (!siteUrl) throw new Error("SITE_URL is missing or invalid");
  return {
    store: supabaseEmailStore(serviceClient()),
    resend: { apiKey: requireEnv("RESEND_API_KEY") },
    from: requireEnv("EMAIL_FROM"),
    replyTo: Deno.env.get("EMAIL_REPLY_TO")?.trim() || undefined,
    layout: { brandName: BRAND_NAME, siteUrl },
  };
}
