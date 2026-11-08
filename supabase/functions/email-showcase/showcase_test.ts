import { assert, assertEquals } from "jsr:@std/assert@1";
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
  product: { name: "Kit", slug: "kit", imagePath: null },
};

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
  assertEquals(withPdf.length, 4);
  for (const a of withPdf) {
    assert(a.filename.includes("EXEMPLE"), a.filename);
    assert(atob(a.content).startsWith("%PDF"));
  }
});

Deno.test("the Auth samples have no Go template action left", () => {
  for (const s of buildShowcase(ctx)) {
    if (s.kind === "rendered") {
      assert(!s.html.includes("{{"), s.label);
      assert(s.html.includes("https://globaltoothgems.com/auth/confirm"), s.label);
    }
  }
});

Deno.test("only_documents keeps the four samples with an invoice or a credit note", () => {
  const kept = withDocuments(buildShowcase(ctx));
  assertEquals(kept.length, 4);
  assert(kept.every((s) => s.kind === "template" && (s.request.attachments?.length ?? 0) === 1));
});
