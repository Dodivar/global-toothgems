import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { TERMS } from "../legal/terms.ts";
import {
  loadLegalStore,
  orderReference,
  studioReference,
  supabaseTermsProvider,
  termsFooterNote,
  termsOfSaleForEmail,
  TERMS_OF_SALE_VERSION,
} from "./termsPdf.ts";
import { failingRender, LEGAL_STORE } from "./termsPdf_fixtures.ts";

const decode = (base64: string) => atob(base64);

Deno.test("terms of sale: a PDF in French or English (anything else is English), named after the version", () => {
  const cases = [["fr", "conditions-generales-de-vente", "FEFF00660072"], ["fr-FR", "conditions-generales-de-vente", "FEFF00660072"], ["en", "terms-of-sale", "FEFF0065006E"], ["de", "terms-of-sale", "FEFF0065006E"]];
  for (const [locale, name, lang] of cases) {
    const terms = termsOfSaleForEmail(LEGAL_STORE, locale, orderReference("GT-1", locale));
    assertEquals(terms.attachment?.filename, `${name}-${TERMS_OF_SALE_VERSION}.pdf`);
    const pdf = decode(terms.attachment!.content);
    assert(pdf.startsWith("%PDF-1.4"));
    assertStringIncludes(pdf, `/Lang <${lang}>`);
    assertEquals(terms.fallback, []);
    assertEquals(terms.version, TERMS_OF_SALE_VERSION);
  }
});

Deno.test("terms of sale: the PDF carries the reference it was given and the seller filled from the store", () => {
  const pdf = decode(termsOfSaleForEmail(LEGAL_STORE, "en", studioReference("Atelier", "en")).attachment!.content);
  // Text stays text in the PDF: plain ASCII runs are readable in the content streams.
  assertStringIncludes(pdf, "(3D Studio subscription \\227 Atelier)");
  assertStringIncludes(pdf, "PIMP TON SMILE");
  assertStringIncludes(pdf, "SIREN 123 456 789");
});

Deno.test("terms of sale: the footer names the version, attached or reproduced, in the e-mail's language", () => {
  const attached = termsOfSaleForEmail(LEGAL_STORE, "fr", "x");
  assertEquals(termsFooterNote(attached, "fr"), "Conditions générales de vente jointes à cet e-mail (PDF) : version du 11 novembre 2026.");
  assertEquals(termsFooterNote(attached, "en"), "Terms of sale attached to this email (PDF): version of 11 November 2026.");
  const inline = termsOfSaleForEmail(LEGAL_STORE, "fr", "x", { render: failingRender });
  assertEquals(termsFooterNote(inline, "fr"), "Conditions générales de vente reproduites dans cet e-mail : version du 11 novembre 2026.");
});

Deno.test("terms of sale: when the PDF fails, the e-mail blocks hold every clause, and the failure is logged", () => {
  const logged: unknown[] = [];
  const terms = termsOfSaleForEmail(LEGAL_STORE, "fr", "Commande GT-1", { render: failingRender, log: (m, d) => logged.push([m, d]) });
  assertEquals(terms.attachment, null);
  const text = terms.fallback.map((b) => b.text).join("\n");
  TERMS.sections.forEach((section, i) => assertStringIncludes(text, `${i + 1}. ${section.title.fr}`));
  assertStringIncludes(text, "PIMP TON SMILE — Ada Test, Entrepreneur individuel (EI)");
  assert(!/\[\[|<<|\*\*/.test(text), "no inline markup left");
  assertEquals(logged.length, 1);
  assertEquals((logged[0] as [string, { reference: string }])[1].reference, "Commande GT-1");
});

/** A Supabase client answering one store_settings read. */
function fakeDb(row: Record<string, unknown> | null, error: { message: string } | null = null, counter = { reads: 0 }): SupabaseClient {
  const query = {
    select: () => query,
    limit: () => query,
    maybeSingle: () => {
      counter.reads += 1;
      return Promise.resolve({ data: row, error });
    },
  };
  return { from: (table: string) => (assertEquals(table, "store_settings"), query) } as unknown as SupabaseClient;
}

Deno.test("terms of sale: the seller's details are read from Settings › Store, once per run", async () => {
  const row = {
    trading_name: "PIMP TON SMILE",
    legal_name: "Ada Test",
    legal_form: "EI",
    publisher_name: null,
    publisher_legal_name: null,
    registration_number: "SIREN 1",
    support_email: "s@example.com",
    country_code: "FR",
    address_line1: "1 rue",
    address_line2: null,
    postal_code: "75004",
    city: "Paris",
    region: null,
  };
  const store = await loadLegalStore(fakeDb(row));
  assertEquals(store?.tradingName, "PIMP TON SMILE");
  assertEquals(store?.publisherName, "");
  assertEquals(await loadLegalStore(fakeDb(null)), null);
  let refused = false;
  await loadLegalStore(fakeDb(null, { message: "down" })).catch(() => (refused = true));
  assert(refused, "a failed read throws: the e-mail waits rather than leaving with an unfilled seller");

  const counter = { reads: 0 };
  const provider = supabaseTermsProvider(fakeDb(row, null, counter));
  await provider("fr", "a");
  await provider("en", "b");
  assertEquals(counter.reads, 1);
});
