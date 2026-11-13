import { serviceClient } from "../_shared/clients.ts";
import { emailDepsFromEnv, sendTemplatedEmail } from "../_shared/email/mod.ts";
import { sendWithResend } from "../_shared/email/resend.ts";
import { loadLegalStore } from "../_shared/email/termsPdf.ts";
import { isValidAddress } from "../_shared/email/send.ts";
import { hasInternalSecret } from "../_shared/internalAuth.ts";
import { json, readJson } from "../_shared/http.ts";
import { buildShowcase, onlyTemplates, type Sample, withDocuments } from "./showcase.ts";
import { functionLogger } from "../_shared/log.ts";

/*
 * POST /functions/v1/email-showcase  { "to": "<address>", "only_documents"?: true, "only"?: ["<template key>", …] }
 *
 * Sends one sample of every e-mail the site sends to one address, so the
 * owner sees them all (see showcase.ts). Deployed with verify_jwt = false
 * (supabase/config.toml): the caller is the database or the team, with the
 * shared secret EMAIL_INTERNAL_SECRET in `x-internal-secret`, like the other
 * e-mail jobs. `only_documents` keeps the samples carrying a PDF: an invoice,
 * a credit note or the terms of sale (decision 130); `only` keeps the samples of those database templates
 * (e.g. ["abandoned_cart", "review_request", "loyalty_reward"]). Answer: the status of each sample, no content.
 */

const log = functionLogger("email-showcase");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Same columns as private.invoice_seller(). */
async function currentSeller(): Promise<Record<string, unknown>> {
  const { data, error } = await serviceClient()
    .from("store_settings")
    .select("store_name, trading_name, legal_name, legal_form, share_capital, registration_number, vat_number, vat_franchise, support_email, business_email, address_line1, address_line2, postal_code, city, region, country_code")
    .eq("id", true)
    .single();
  if (error || !data) throw new Error(`store settings unreadable: ${error?.message}`);
  const d = data as Record<string, string | boolean | null>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    store_name: d.store_name, trading_name: s(d.trading_name), legal_name: s(d.legal_name), legal_form: s(d.legal_form),
    share_capital: s(d.share_capital), registration_number: s(d.registration_number), vat_number: s(d.vat_number),
    vat_franchise: d.vat_franchise === true, email: s(d.support_email) || s(d.business_email),
    address_line1: s(d.address_line1), address_line2: s(d.address_line2), postal_code: s(d.postal_code), city: s(d.city),
    region: s(d.region), country_code: s(d.country_code),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!(await hasInternalSecret(req, Deno.env.get("EMAIL_INTERNAL_SECRET")))) return json({ error: "unauthorized" }, 401);
  const body = await readJson(req, 1024);
  const to = body && typeof body === "object" ? (body as { to?: unknown }).to : undefined;
  if (typeof to !== "string" || !isValidAddress(to.trim())) return json({ error: "invalid_recipient" }, 400);
  const onlyDocuments = (body as { only_documents?: unknown }).only_documents === true;
  const only = (body as { only?: unknown }).only;
  if (only !== undefined && (!Array.isArray(only) || only.length === 0 || only.length > 30 || !only.every((k) => typeof k === "string"))) {
    return json({ error: "invalid_only" }, 400);
  }

  try {
    const deps = emailDepsFromEnv();
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const all: Sample[] = buildShowcase({
      to: to.trim(),
      runId: crypto.randomUUID(),
      siteUrl: deps.layout.siteUrl,
      mediaBaseUrl: `${supabaseUrl}/storage/v1/object/public/product-media`,
      seller: await currentSeller(),
      legalStore: await loadLegalStore(serviceClient()),
      product: { name: "Kit d’Application Premium", slug: "kit-application-premium", imagePath: "products/kit-application-premium/01.jpg" },
    });

    const filtered = only ? onlyTemplates(all, only as string[]) : all;
    const samples = onlyDocuments ? withDocuments(filtered) : filtered;
    const results: { label: string; status: string; error?: string }[] = [];
    for (const sample of samples) {
      try {
        if (sample.kind === "template") {
          const result = await sendTemplatedEmail(deps, sample.request);
          results.push({ label: sample.label, status: result.status, ...("error" in result ? { error: result.error } : {}) });
        } else {
          await sendWithResend(deps.resend, {
            from: deps.from,
            to: to.trim(),
            replyTo: deps.replyTo,
            subject: sample.subject,
            html: sample.html,
            text: sample.text,
            idempotencyKey: `showcase:${crypto.randomUUID()}`,
            tags: [{ name: "template", value: "showcase_auth" }],
          });
          results.push({ label: sample.label, status: "sent" });
        }
      } catch (error) {
        log("sample failed", { label: sample.label, error: error instanceof Error ? error.message : error });
        results.push({ label: sample.label, status: "crashed", error: error instanceof Error ? error.message : String(error) });
      }
      await pause(700); // Resend's default rate limit is 2 requests per second.
    }
    return json({ ok: true, results }, 200);
  } catch (error) {
    log("showcase failed", error instanceof Error ? error.message : error);
    return json({ error: "server_error" }, 500);
  }
});
