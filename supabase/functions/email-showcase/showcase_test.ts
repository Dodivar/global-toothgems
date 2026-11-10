import { assert, assertEquals } from "jsr:@std/assert@1";
import { LEGAL_STORE } from "../_shared/email/termsPdf_fixtures.ts";
import { TERMS_OF_SALE_VERSION } from "../_shared/email/termsPdf.ts";
import { buildShowcase, withDocuments } from "./showcase.ts";

const ctx = {
  to: "owner@example.com",
  runId: "run-1",
  siteUrl: "https://globaltoothgems.com",
  mediaBaseUrl: "https://example.supabase.co/storage/v1/object/public/product-media",
  seller: {
    store_name: "Global Toothgems",
    trading_name: "PIMP TON SMILE",
    legal_name: "Ada Test",
    legal_form: "Entrepreneur individuel (EI)",
    registration_number: "SIRET 123",
    vat_franchise: true,
    country_code: "FR",
  },
  legalStore: LEGAL_STORE,
  product: { name: "Kit", slug: "kit", imagePath: null },
};

const TERMS_FILE = `conditions-generales-de-vente-${TERMS_OF_SALE_VERSION}.pdf`;

Deno.test("one sample per database template and per Auth template, all to the owner", () => {
  const samples = buildShowcase(ctx);
  const templates = samples.flatMap((s) => (s.kind === "template" ? [s.request.templateKey] : []));
  assertEquals(new Set(templates).size, 15);
  assertEquals(samples.filter((s) => s.kind === "rendered").length, 2);
  for (const s of samples) {
    if (s.kind === "template") {
      assertEquals(s.request.to, "owner@example.com");
      assert(s.request.eventKey.startsWith("showcase:run-1:"), "showcase event keys never collide with real events");
    }
  }
});

Deno.test("the documents are real PDFs with sample numbers", () => {
  const withPdf = buildShowcase(ctx).flatMap((s) => (s.kind === "template" ? s.request.attachments ?? [] : []));
  const invoices = withPdf.filter((a) => a.filename !== TERMS_FILE);
  assertEquals(invoices.length, 4);
  for (const a of invoices) assert(a.filename.includes("EXEMPLE"), a.filename);
  for (const a of withPdf) assert(atob(a.content).startsWith("%PDF"));
});

Deno.test("every contract confirmation shows the terms of sale PDF and names its version (decision 130)", () => {
  const byKey = new Map(buildShowcase(ctx).flatMap((s) => (s.kind === "template" ? [[s.request.templateKey, s.request] as const] : [])));
  for (const key of ["order_confirmation", "course_enrolment", "studio_subscription_confirmation"]) {
    const request = byKey.get(key)!;
    assert(request.attachments?.some((a) => a.filename === TERMS_FILE), key);
    const content = typeof request.content === "function" ? request.content("fr") : request.content;
    assertEquals(content?.footerNote, "Conditions générales de vente jointes à cet e-mail (PDF) : version du 10 novembre 2026.", key);
  }
  assert(!byKey.get("order_refunded")!.attachments?.some((a) => a.filename === TERMS_FILE));
});

Deno.test("the Auth samples have no Go template action left", () => {
  for (const s of buildShowcase(ctx)) {
    if (s.kind === "rendered") {
      assert(!s.html.includes("{{"), s.label);
      assert(s.html.includes("https://globaltoothgems.com/auth/confirm"), s.label);
    }
  }
});

Deno.test("only_documents keeps the samples with a PDF: invoices, credit notes, terms of sale", () => {
  const kept = withDocuments(buildShowcase(ctx));
  assertEquals(kept.length, 6);
  assert(kept.every((s) => s.kind === "template" && (s.request.attachments?.length ?? 0) >= 1));
});
