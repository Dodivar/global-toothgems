import { requireEnv, serviceClient, stripeClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { emailDepsFromEnv } from "../_shared/email/mod.ts";
import { sendStudioWithdrawalEmails, supabasePendingSource } from "../_shared/email/events.ts";
import { withdrawFromStudio } from "../_shared/studioWithdrawal.ts";
import { liveWithdrawalDeps } from "../_shared/studioWithdrawalLive.ts";
import { handleStudioWithdraw } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): the member's token
 * is checked here, like studio-manage-subscription.
 */

const supabase = serviceClient();
const stripe = stripeClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));
const log = (message: string, detail?: unknown) => console.error(`[studio-withdraw] ${message}`, detail ?? "");

// The acknowledgement goes out at once; the send-pending-emails sweep catches a failure.
const acknowledge = async () => {
  await sendStudioWithdrawalEmails(emailDepsFromEnv(), supabasePendingSource(supabase), { limit: 5, log });
};

Deno.serve((req) =>
  handleStudioWithdraw(req, {
    origins,
    async userFromToken(token) {
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },
    withdraw: (userId) => withdrawFromStudio(userId, liveWithdrawalDeps(supabase, stripe, log, acknowledge)),
    log,
  })
);
