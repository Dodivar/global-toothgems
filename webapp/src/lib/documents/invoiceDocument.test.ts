import { describe, expect, it } from "vitest";
import en from "../../i18n/locales/en.json";
import fr from "../../i18n/locales/fr.json";
import { mapInvoice, sortInvoices, type InvoiceRow } from "./invoiceModel";
import type { Translate } from "./legal";
import { invoiceDocument, invoiceFileName, type InvoiceFormat } from "./invoiceDocument";
import { layoutDocument } from "./template";

function translator(messages: unknown): Translate {
  return (key, params = {}) => {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
    if (typeof value !== "string") throw new Error(`missing key ${key}`);
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name]));
  };
}

const t = translator(fr);
const fmt: InvoiceFormat = {
  lang: "fr",
  money: (minor, currency) => new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(minor / 100),
  date: (iso) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso)),
  country: (code) => new Intl.DisplayNames(["fr-FR"], { type: "region" }).of(code) ?? code,
  percent: (bp) => new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 2 }).format(bp / 10000),
};

const seller = {
  store_name: "Global Toothgems",
  legal_name: "Global Toothgems SAS",
  legal_form: "SAS",
  share_capital: "10 000 €",
  registration_number: "RCS Lyon 900 000 000",
  vat_number: "FR00900000000",
  email: "contact@example.com",
  address_line1: "1 rue de l’Exemple",
  address_line2: "",
  postal_code: "69001",
  city: "Lyon",
  region: "",
  country_code: "FR",
};
const buyer = {
  email: "camille@example.com",
  order_number: "GT-100149",
  address: { first_name: "Camille", last_name: "Roussel", address_line1: "12 rue des Lilas", postal_code: "69003", city: "Lyon", country_code: "fr" },
};

/** As `issue_order_invoice()` writes it (numbers as Postgres numerics in JSON). */
const invoiceRow: InvoiceRow = {
  id: "inv-1",
  kind: "invoice",
  invoice_number: "FA-2026-000001",
  issued_at: "2026-10-09T08:00:00+00:00",
  sale_date: "2026-10-09",
  currency: "EUR",
  total_excl_tax: "74.71",
  total_tax: "14.94",
  total_incl_tax: "89.65",
  seller,
  buyer,
  lines: [
    { kind: "product", description: "Cœur chromé", detail: "Or", quantity: 2, unit_price_incl: 41.0, unit_price_excl: 34.17, discount_incl: 8.2, vat_rate_bp: 2000, total_incl: 73.8, vat_amount: 12.3, total_excl: 61.5 },
    { kind: "gift_card", description: "Carte cadeau", detail: "50.00 EUR", quantity: 1, unit_price_incl: 50, unit_price_excl: 50, discount_incl: 0, vat_rate_bp: 0, total_incl: 50, vat_amount: 0, total_excl: 50 },
    { kind: "shipping", description: "Colissimo", detail: null, quantity: 1, unit_price_incl: 6.9, unit_price_excl: 5.75, discount_incl: 0, vat_rate_bp: 2000, total_incl: 6.9, vat_amount: 1.15, total_excl: 5.75 },
  ],
  vat_breakdown: [
    { vat_rate_bp: 2000, total_excl: 67.25, vat_amount: 13.45, total_incl: 80.7 },
    { vat_rate_bp: 0, total_excl: 50, vat_amount: 0, total_incl: 50 },
  ],
  payment: { paid_at: "2026-10-09T07:59:00+00:00", gift_card_amount: 20, charged_amount: 69.65 },
};

const creditRow: InvoiceRow = {
  ...invoiceRow,
  id: "av-1",
  kind: "credit_note",
  invoice_number: "AV-2026-000001",
  total_excl_tax: "2.50",
  total_tax: "0.50",
  total_incl_tax: "3.00",
  lines: [{ kind: "adjustment", description: null, detail: null, quantity: null, vat_rate_bp: 2000, total_incl: 3, vat_amount: 0.5, total_excl: 2.5 }],
  vat_breakdown: [{ vat_rate_bp: 2000, total_excl: 2.5, vat_amount: 0.5, total_incl: 3 }],
  payment: { refunded_at: "2026-10-10T10:00:00+00:00", refund_method: "card", reason: "goodwill", credited_invoice_number: "FA-2026-000001" },
};

const texts = (doc: ReturnType<typeof invoiceDocument>) =>
  layoutDocument(doc)
    .flat()
    .flatMap((op) => (op.kind === "text" ? [op.text] : []))
    .join("\n")
    // Intl writes narrow no-break spaces in French amounts.
    .replace(/[\u202f\u00a0]/g, " ");

describe("invoice rows", () => {
  it("maps the frozen snapshot to minor units, without recomputing", () => {
    const inv = mapInvoice(invoiceRow);
    expect(inv.kind).toBe("invoice");
    expect([inv.totalExcl, inv.totalTax, inv.totalIncl]).toEqual([7471, 1494, 8965]);
    expect(inv.lines[0]).toMatchObject({ unitPriceExcl: 3417, discountIncl: 820, vatRateBp: 2000, totalExcl: 6150 });
    expect(inv.buyer.address).toMatchObject({ name: "Camille Roussel", countryCode: "FR" });
    expect(inv.seller.addressLines).toEqual(["1 rue de l’Exemple", "69001 Lyon"]);
    expect(inv.payment).toMatchObject({ giftCard: 2000, charged: 6965 });
  });

  it("reads a credit note line that credits an amount, and orders invoices before credit notes", () => {
    const note = mapInvoice(creditRow);
    expect(note.kind).toBe("creditNote");
    expect(note.lines[0]).toMatchObject({ kind: "adjustment", quantity: undefined, unitPriceExcl: undefined, totalIncl: 300 });
    expect(note.payment).toMatchObject({ refundMethod: "card", creditedNumber: "FA-2026-000001" });
    expect(sortInvoices([note, mapInvoice(invoiceRow)]).map((d) => d.number)).toEqual(["FA-2026-000001", "AV-2026-000001"]);
  });
});

describe("invoice PDF", () => {
  it("carries the mandatory mentions: number, dates, seller identity, buyer, unit prices excl. VAT, VAT per rate", () => {
    const all = texts(invoiceDocument(mapInvoice(invoiceRow), t, fmt));
    for (const expected of [
      "FACTURE",
      "FA-2026-000001",
      "Date de la vente",
      "Global Toothgems SAS",
      "TVA intracommunautaire FR00900000000",
      "Immatriculation RCS Lyon 900 000 000",
      "Camille Roussel",
      "34,17 €",
      "20 %",
      "Récapitulatif de la TVA",
      "Livraison — Colissimo",
      "hors champ de la TVA",
      "Facture acquittée le 9 octobre 2026",
      "indemnité forfaitaire de 40 €",
    ]) {
      expect(all).toContain(expected);
    }
    expect(all).toContain("Total TTC");
  });

  it("draws a credit note against its invoice", () => {
    const invoice = mapInvoice(invoiceRow);
    const doc = invoiceDocument(mapInvoice(creditRow), translator(en), { ...fmt, lang: "en" }, invoice);
    expect(doc.title).toBe("Credit note");
    expect(doc.meta.map((m) => m.value)).toContain("FA-2026-000001");
    const all = texts(doc);
    expect(all).toContain("Credit note issued against invoice FA-2026-000001");
    expect(all).toContain("refunded to the payment method used");
    expect(all).not.toContain("late payment");
  });

  it("names the file after the number", () => {
    expect(invoiceFileName(mapInvoice(invoiceRow), t)).toBe("facture-FA-2026-000001.pdf");
    expect(invoiceFileName(mapInvoice(creditRow), translator(en))).toBe("credit-note-AV-2026-000001.pdf");
  });
});
