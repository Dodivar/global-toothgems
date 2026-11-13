import { assert, assertEquals } from "jsr:@std/assert@1";
import { LEGAL_STORE } from "../_shared/email/termsPdf_fixtures.ts";
import { STUDIO_TERMS_VERSION, TERMS_OF_SALE_VERSION } from "../_shared/email/termsPdf.ts";
import { buildShowcase, onlyTemplates, withDocuments } from "./showcase.ts";

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
const STUDIO_TERMS_FILE = `conditions-abonnement-studio-3d-${STUDIO_TERMS_VERSION}.pdf`;

Deno.test("one sample per database template and per Auth template, all to the owner", () => {
  const samples = buildShowcase(ctx);
  const templates = samples.flatMap((s) => (s.kind === "template" ? [s.request.templateKey] : []));
  assertEquals(new Set(templates).size, 19);
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
  const invoices = withPdf.filter((a) => a.filename !== TERMS_FILE && a.filename !== STUDIO_TERMS_FILE);
  assertEquals(invoices.length, 4);
  for (const a of invoices) assert(a.filename.includes("EXEMPLE"), a.filename);
  for (const a of withPdf) assert(atob(a.content).startsWith("%PDF"));
});

Deno.test("every contract confirmation shows its terms PDF and names its version (decisions 130, 135)", () => {
  const byKey = new Map(buildShowcase(ctx).flatMap((s) => (s.kind === "template" ? [[s.request.templateKey, s.request] as const] : [])));
  const order = byKey.get("order_confirmation")!;
  assert(order.attachments?.some((a) => a.filename === TERMS_FILE));
  const orderContent = typeof order.content === "function" ? order.content("fr") : order.content;
  assertEquals(orderContent?.footerNote, "Conditions générales de vente jointes à cet e-mail (PDF) : version du 12 novembre 2026.");
  // The Studio is sold by the publisher, under its own terms.
  const studio = byKey.get("studio_subscription_confirmation")!;
  assert(studio.attachments?.some((a) => a.filename === STUDIO_TERMS_FILE));
  assert(!studio.attachments?.some((a) => a.filename === TERMS_FILE));
  const studioContent = typeof studio.content === "function" ? studio.content("fr") : studio.content;
  assertEquals(studioContent?.footerNote, "Conditions générales d’abonnement au Studio 3D jointes à cet e-mail (PDF) : version du 11 novembre 2026.");
  for (const key of ["order_refunded", "course_enrolment"]) assert(!byKey.get(key)!.attachments?.some((a) => a.filename === TERMS_FILE), key);
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
  assertEquals(kept.length, 5);
  assert(kept.every((s) => s.kind === "template" && (s.request.attachments?.length ?? 0) >= 1));
});

Deno.test("only keeps the samples of the templates asked for: the four reminders carry their opt-out link", () => {
  const kept = onlyTemplates(buildShowcase(ctx), ["abandoned_cart", "review_request", "loyalty_reward", "course_review_request", "nope"]);
  assertEquals(kept.map((s) => (s.kind === "template" ? s.request.templateKey : "")), ["abandoned_cart", "review_request", "loyalty_reward", "course_review_request"]);
  for (const s of kept) {
    if (s.kind !== "template") continue;
    const content = typeof s.request.content === "function" ? s.request.content("fr") : s.request.content;
    assertEquals(content?.unsubscribeUrl, "https://globaltoothgems.com/rappels/desinscription?token=EXEMPLE");
  }
});
