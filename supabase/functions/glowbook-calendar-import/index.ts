import { serviceClient } from "../_shared/clients.ts";
import { functionLogger } from "../_shared/log.ts";
import { fetchCalendar, handleCalendarImport } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): called by pg_cron with
 * the shared secret EMAIL_INTERNAL_SECRET, see handler.ts.
 */

const log = functionLogger("glowbook-calendar-import");

Deno.serve((req) => {
  const db = serviceClient();
  return handleCalendarImport(req, {
    secret: Deno.env.get("EMAIL_INTERNAL_SECRET"),
    now: () => Date.now(),
    log,
    fetchCalendar: (url) => fetchCalendar(url),
    async targets(limit) {
      const { data, error } = await db.rpc("glowbook_calendar_import_targets", { p_limit: limit });
      if (error) throw new Error(`glowbook_calendar_import_targets: ${error.message}`);
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        userId: String(r.user_id),
        url: String(r.url),
        timezone: typeof r.timezone === "string" ? r.timezone : "Europe/Paris",
        horizonDays: Number(r.horizon_days ?? 56),
      }));
    },
    async apply(target, hours, error) {
      const { error: dbError } = await db.rpc("glowbook_apply_calendar_import", {
        p_user: target.userId,
        p_url: target.url,
        p_hours: hours,
        p_error: error,
      });
      if (dbError) throw new Error(`glowbook_apply_calendar_import: ${dbError.message}`);
    },
  });
});
