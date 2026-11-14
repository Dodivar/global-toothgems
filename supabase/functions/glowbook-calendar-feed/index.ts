import { requireEnv, serviceClient } from "../_shared/clients.ts";
import { functionLogger } from "../_shared/log.ts";
import { handleCalendarFeed, mapFeed } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): calendar apps send no
 * Supabase token; the secret in the address is the authentication, checked by
 * glowbook_calendar_feed() as the service role.
 */

const supabase = serviceClient();
const siteUrl = requireEnv("SITE_URL");
const log = functionLogger("glowbook-calendar-feed");

Deno.serve((req) =>
  handleCalendarFeed(req, {
    siteUrl,
    log,
    async ipAllowed(ipHash) {
      const { data, error } = await supabase.rpc("glowbook_calendar_feed_ip_allowed", { p_ip_hash: ipHash });
      if (error) throw new Error(error.message);
      return data === true;
    },
    async feed(token) {
      const { data, error } = await supabase.rpc("glowbook_calendar_feed", { p_token: token });
      if (error) throw new Error(error.message);
      return data ? mapFeed(data) : null;
    },
  })
);
