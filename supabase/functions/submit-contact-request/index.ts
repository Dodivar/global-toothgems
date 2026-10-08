import { callerClient, requireEnv, serviceClient } from "../_shared/clients.ts";
import { emailDepsFromEnv, sendTemplatedEmail } from "../_shared/email/mod.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { handleContact, type ContactDeps } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): visitors call it with the publishable
 * key, which is not a JWT. A member's access token is verified here (auth.getUser), see handler.ts.
 */

const supabase = serviceClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));
const BUCKET = "contact-attachments";

const deps: ContactDeps = {
  origins,

  async userFromToken(token) {
    const { data, error } = await supabase.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },

  async ipAllowed(ipHash) {
    const { data, error } = await supabase.rpc("contact_ip_allowed", { p_ip_hash: ipHash });
    if (error) throw new Error(error.message);
    return data === true;
  },

  async upload(path, bytes, contentType) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(error.message);
  },

  async remove(paths) {
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
  },

  async submit(caller, s, paths) {
    // A member acts with their own JWT (the RPC reads auth.uid()); a visitor goes through the service role.
    const client = caller.token ? callerClient(caller.token) : supabase;
    const { data, error } = await client.rpc("submit_contact_request", {
      p_name: s.name,
      p_email: s.email,
      p_category: s.category,
      p_subject: s.subject,
      p_message: s.message,
      p_order_reference: s.orderReference,
      p_locale: s.locale,
      p_attachment_paths: paths,
    });
    if (error) return { error: { code: error.code, message: error.message } };
    return { ticket: String(data) };
  },

  async supportEmail() {
    const { data } = await supabase.from("store_settings").select("support_email").limit(1).maybeSingle();
    return data?.support_email?.trim() || Deno.env.get("EMAIL_REPLY_TO")?.trim() || null;
  },

  sendEmail: (request) => sendTemplatedEmail(emailDepsFromEnv(), request),
  log: (message, detail) => console.error(`[submit-contact-request] ${message}`, detail ?? ""),
};

Deno.serve((req) => handleContact(req, deps));
