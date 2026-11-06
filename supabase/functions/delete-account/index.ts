import { callerClient, requireEnv, serviceClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { emailDepsFromEnv, sendTemplatedEmail } from "../_shared/email/mod.ts";
import { type EraseResult, handleDeleteAccount, type Recipient } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): the member's token
 * is checked here, like studio-withdraw.
 */

const supabase = serviceClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));
const log = (message: string, detail?: unknown) => console.error(`[delete-account] ${message}`, detail ?? "");

/** "6 novembre 2026" / "6 November 2026", Paris time. */
function erasureDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })
    .format(date);
}

Deno.serve((req) =>
  handleDeleteAccount(req, {
    origins,
    async memberFromToken(token) {
      const { data, error } = await supabase.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
    },
    async blockers(token) {
      const { data, error } = await callerClient(token).rpc("my_account_erasure_blockers");
      if (error) throw new Error(`my_account_erasure_blockers: ${error.message}`);
      return Array.isArray(data) ? data.map(String) : [];
    },
    async recipient(member): Promise<Recipient | null> {
      const { data } = await supabase.from("profiles").select("email, preferred_locale").eq("id", member.id).maybeSingle();
      const email = member.email ?? data?.email ?? null;
      return email ? { email, locale: data?.preferred_locale === "en" ? "en" : "fr" } : null;
    },
    async files(userId) {
      const { data, error } = await supabase.rpc("account_erasure_files", { p_user: userId });
      if (error) throw new Error(`account_erasure_files: ${error.message}`);
      return ((data ?? []) as { bucket_id: string; name: string }[]).map((f) => ({ bucket: f.bucket_id, name: f.name }));
    },
    async removeFiles(bucket, names) {
      const { error } = await supabase.storage.from(bucket).remove(names);
      if (error) throw new Error(`storage remove (${bucket}): ${error.message}`);
    },
    async erase(userId): Promise<EraseResult> {
      const { data, error } = await supabase.rpc("erase_account", { p_user: userId });
      if (error) throw new Error(`erase_account: ${error.message}`);
      const answer = (data ?? {}) as { status?: string; blockers?: unknown };
      if (answer.status === "erased" || answer.status === "not_found") return { status: answer.status };
      if (answer.status === "blocked") {
        return { status: "blocked", blockers: Array.isArray(answer.blockers) ? answer.blockers.map(String) : [] };
      }
      throw new Error(`erase_account: unexpected answer ${JSON.stringify(answer)}`);
    },
    async confirm(userId, recipient, erasedAt) {
      const result = await sendTemplatedEmail(emailDepsFromEnv(), {
        templateKey: "account_deleted",
        to: recipient.email,
        locale: recipient.locale,
        variables: { date: erasureDate(erasedAt, recipient.locale) },
        eventKey: `account_deleted:${userId}`,
      });
      if (result.status !== "sent" && result.status !== "duplicate") log("confirmation not sent", result);
    },
    now: () => new Date(),
    log,
  })
);
