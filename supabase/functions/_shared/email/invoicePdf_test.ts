import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import { attachDocument, documentFormat, documentTranslator, orderInvoice, refundCreditNote } from "./invoicePdf.ts";
import { CREDIT_ROW, INVOICE_ROW } from "./invoicePdf_fixtures.ts";
import { mapInvoice } from "../documents/invoiceModel.ts";

const pdfText = (base64: string) => {
  const binary = atob(base64);
  return binary;
};

Deno.test("an invoice becomes a named PDF attachment in the order's language", () => {
  const fr = attachDocument(mapInvoice(INVOICE_ROW), "fr");
  assertEquals(fr.number, "FA-2026-000001");
  assertEquals(fr.attachment.filename, "facture-FA-2026-000001.pdf");
  const body = pdfText(fr.attachment.content);
  assert(body.startsWith("%PDF-1.4"));
  assertStringIncludes(body, "(FACTURE)");
  assertStringIncludes(body, "Global Toothgems SAS");
  const en = attachDocument(mapInvoice(INVOICE_ROW), "en");
  assertEquals(en.attachment.filename, "invoice-FA-2026-000001.pdf");
  assertStringIncludes(pdfText(en.attachment.content), "(INVOICE)");
});

Deno.test("the order's invoice and a refund's credit note are found among the order's documents", async () => {
  const source = { documentsOfOrder: () => Promise.resolve([CREDIT_ROW, INVOICE_ROW]) };
  assertEquals((await orderInvoice(source, "o-1", "fr"))?.number, "FA-2026-000001");
  const note = await refundCreditNote(source, "o-1", "r-1", "fr");
  assertEquals(note?.attachment.filename, "avoir-AV-2026-000001.pdf");
  assertStringIncludes(pdfText(note!.attachment.content), "FA-2026-000001");
  assertEquals(await refundCreditNote(source, "o-1", "r-2", "fr"), null);
  assertEquals(await orderInvoice({ documentsOfOrder: () => Promise.resolve([]) }, "o-1", "fr"), null);
});

Deno.test("strings and formats follow the webapp's", () => {
  const t = documentTranslator("fr-FR");
  assertEquals(t("documents.page", { page: 1, count: 2 }), "Page 1 sur 2");
  assertThrows(() => t("documents.nope"));
  assertEquals(documentTranslator("en")("documents.invoice.title"), "Invoice");
  const fmt = documentFormat("en");
  assertEquals(fmt.money(1990, "EUR"), "€19.90");
  assertEquals(fmt.money(4900, "EUR"), "€49");
  assertEquals(fmt.percent(550), "5.5%");
  assertEquals(fmt.date("2026-10-09"), "9 October 2026");
});
