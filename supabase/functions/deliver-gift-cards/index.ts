import { serviceClient } from "../_shared/clients.ts";
import { emailDepsFromEnv } from "../_shared/email/mod.ts";
import { deliverGiftCards, supabaseGiftCardSource } from "../_shared/email/giftCards.ts";
import { handleDeliverGiftCards } from "./handler.ts";
import { functionLogger } from "../_shared/log.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): called by pg_cron
 * with the shared secret, see handler.ts.
 */

const log = functionLogger("deliver-gift-cards");

Deno.serve((req) =>
  handleDeliverGiftCards(req, {
    secret: Deno.env.get("EMAIL_INTERNAL_SECRET"),
    run: (limit) => deliverGiftCards(emailDepsFromEnv(), supabaseGiftCardSource(serviceClient()), { limit, log }),
    log,
  })
);
