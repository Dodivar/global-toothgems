import { requireEnv, serviceClient, stripeClient } from "../_shared/clients.ts";
import { readSiteOrigins } from "../_shared/http.ts";
import { handlePortal, type PortalDeps } from "./handler.ts";

/*
 * Deployed with verify_jwt = false (supabase/config.toml): the member's token
 * is checked here. The portal configuration is the one `studio-billing-setup`
 * created (metadata kind = studio_portal); without it, Stripe's default one.
 */

const supabase = serviceClient();
const stripe = stripeClient();
const origins = readSiteOrigins(requireEnv("SITE_URL"), Deno.env.get("ALLOWED_RETURN_ORIGINS"));

let configurationId: string | null | undefined;
async function studioConfiguration(): Promise<string | null> {
  if (configurationId !== undefined) return configurationId;
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  configurationId = list.data.find((config) => config.metadata?.kind === "studio_portal")?.id ?? null;
  return configurationId;
}

const deps: PortalDeps = {
  origins,

  async userFromToken(token) {
    const { data, error } = await supabase.auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  },

  async customerOf(userId) {
    const { data, error } = await supabase.from("stripe_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.stripe_customer_id ?? null;
  },

  async createPortalSession({ customerId, returnUrl, locale }) {
    const configuration = await studioConfiguration();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      locale,
      ...(configuration ? { configuration } : {}),
    });
    return { url: session.url };
  },

  log: (message, detail) => console.error(`[studio-billing-portal] ${message}`, detail ?? ""),
};

Deno.serve((req) => handlePortal(req, deps));
