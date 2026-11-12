import { emailDepsFromEnv, sendTemplatedEmail } from "../_shared/email/mod.ts";
import { parseOrigin } from "../_shared/http.ts";
import { handleSendEmail } from "./handler.ts";
import { functionLogger } from "../_shared/log.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): called by the
 * webapp's server routes with the shared secret, see handler.ts.
 */

const log = functionLogger("send-email");

Deno.serve((req) =>
  handleSendEmail(req, {
    secret: Deno.env.get("EMAIL_INTERNAL_SECRET"),
    siteUrl: parseOrigin(Deno.env.get("SITE_URL")),
    send: (request) => sendTemplatedEmail(emailDepsFromEnv(), request),
    log,
  })
);
