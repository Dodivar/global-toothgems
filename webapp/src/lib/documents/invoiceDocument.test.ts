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

  it("under the VAT franchise: no VAT column, total or breakdown, and the art. 293 B mention", () => {
    const franchised: InvoiceRow = {
      ...invoiceRow,
      total_excl_tax: "65.90",
      total_tax: "0",
      total_incl_tax: "65.90",
      seller: { ...seller, vat_number: "", vat_franchise: true },
      lines: [
        { kind: "product", description: "Cœur chromé", detail: "Or", quantity: 2, unit_price_incl: 34.17, unit_price_excl: 34.17, discount_incl: 8.2, vat_rate_bp: 0, total_incl: 60.14, vat_amount: 0, total_excl: 60.14 },
        { kind: "shipping", description: "Colissimo", detail: null, quantity: 1, unit_price_incl: 5.76, unit_price_excl: 5.76, discount_incl: 0, vat_rate_bp: 0, total_incl: 5.76, vat_amount: 0, total_excl: 5.76 },
      ],
      vat_breakdown: [{ vat_rate_bp: 0, total_excl: 65.9, vat_amount: 0, total_incl: 65.9 }],
    };
    const inv = mapInvoice(franchised);
    expect(inv.seller.vatFranchise).toBe(true);
    expect(mapInvoice(invoiceRow).seller.vatFranchise).toBe(false);

    const all = texts(invoiceDocument(inv, t, fmt));
    expect(all).toContain("TVA non applicable, art. 293 B du CGI");
    expect(all).toContain("PRIX UNITAIRE");
    expect(all).toContain("remise de 8,20 €");
    for (const absent of ["TVA intracommunautaire", "Récapitulatif de la TVA", "HT", "TTC", "0 %"]) {
      expect(all).not.toContain(absent);
    }
    // An English invoice keeps the French legal wording.
    expect(texts(invoiceDocument(inv, translator(en), { ...fmt, lang: "en" }))).toContain("TVA non applicable, art. 293 B du CGI");
  });

  it("a 3D Studio invoice: plan lines with interval and period, a proration credit, the account credit used", () => {
    const studio: InvoiceRow = {
      ...invoiceRow,
      invoice_number: "FA-2026-000042",
      total_excl_tax: "20.00",
      total_tax: "0",
      total_incl_tax: "20.00",
      seller: { ...seller, vat_number: "", vat_franchise: true },
      buyer: { email: "camille@example.com", order_number: "", address: { first_name: "Camille", last_name: "Roussel" } },
      lines: [
        { kind: "subscription", description: "Essentiel", plan: "essential", interval: "month", proration: true, period_start: null, period_end: null, quantity: 1, unit_price_incl: -4.95, unit_price_excl: -4.95, discount_incl: 0, vat_rate_bp: 0, total_incl: -4.95, vat_amount: 0, total_excl: -4.95 },
        { kind: "subscription", description: "Atelier", plan: "atelier", interval: "month", proration: false, period_start: "2026-10-26T10:00:00Z", period_end: "2026-11-26T10:00:00Z", quantity: 1, unit_price_incl: 24.95, unit_price_excl: 24.95, discount_incl: 0, vat_rate_bp: 0, total_incl: 24.95, vat_amount: 0, total_excl: 24.95 },
      ],
      vat_breakdown: [{ vat_rate_bp: 0, total_excl: 20, vat_amount: 0, total_incl: 20 }],
      payment: { paid_at: "2026-10-26T10:00:00Z", gift_card_amount: 0, charged_amount: 15, balance_amount: 5, billing_reason: "subscription_update" },
    };
    const inv = mapInvoice(studio);
    expect(inv.lines.map((l) => [l.kind, l.totalIncl, l.subscription?.plan, l.subscription?.proration])).toEqual([
      ["subscription", -495, "essential", true],
      ["subscription", 2495, "atelier", false],
    ]);
    expect(inv.payment.balance).toBe(500);
    const all = texts(invoiceDocument(inv, t, fmt));
    expect(all).toContain("Ajustement au prorata — formule Essentiel");
    expect(all).toContain("Abonnement Studio 3D — formule Atelier");
    expect(all).toContain("facturation mensuelle");
    expect(all).toContain("du 26 octobre 2026 au 26 novembre 2026");
    expect(all).toContain("-4,95 €");
    expect(all).toContain("Réglé avec le crédit de votre compte");
    expect(all).toContain("paiement de l’abonnement par carte");
    expect(all).toContain("TVA non applicable, art. 293 B du CGI");
    expect(all).not.toContain("Commande");
  });

  it("a 3D Studio withdrawal credit note names the unused share and the days used", () => {
    const note: InvoiceRow = {
      ...creditRow,
      seller: { ...seller, vat_franchise: true },
      total_excl_tax: "17.91",
      total_tax: "0",
      total_incl_tax: "17.91",
      lines: [{ kind: "subscription", withdrawal: true, description: "Artist", plan: "artist", interval: "month", used_days: 3, period_days: 30, quantity: null, vat_rate_bp: 0, total_incl: 17.91, vat_amount: 0, total_excl: 17.91 }],
      vat_breakdown: [{ vat_rate_bp: 0, total_excl: 17.91, vat_amount: 0, total_incl: 17.91 }],
      payment: { refunded_at: "2026-10-28T10:00:00Z", refund_method: "card", reason: "withdrawal", credited_invoice_number: "FA-2026-000042" },
    };
    const all = texts(invoiceDocument(mapInvoice(note), translator(en), { ...fmt, lang: "en" }));
    expect(all.replaceAll("\n", " ")).toContain("Withdrawal — unused share of the 3D Studio subscription, Artist plan");
    expect(all).toContain("3 of 30 days used");
  });

  it("names the file after the number", () => {
    expect(invoiceFileName(mapInvoice(invoiceRow), t)).toBe("facture-FA-2026-000001.pdf");
    expect(invoiceFileName(mapInvoice(creditRow), translator(en))).toBe("credit-note-AV-2026-000001.pdf");
  });
});
