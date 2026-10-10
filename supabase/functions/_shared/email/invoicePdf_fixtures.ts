/** Invoice rows for the e-mail tests, as `issue_order_invoice()` / `issue_refund_credit_note()` write them. */
import type { InvoiceRowWithRefund } from "./invoicePdf.ts";

export const INVOICE_ROW: InvoiceRowWithRefund = {
  id: "inv-1",
  kind: "invoice",
  refund_id: null,
  invoice_number: "FA-2026-000001",
  issued_at: "2026-10-09T08:00:00+00:00",
  sale_date: "2026-10-09",
  currency: "EUR",
  total_excl_tax: "16.58",
  total_tax: "3.32",
  total_incl_tax: "19.90",
  seller: { store_name: "Global Toothgems", legal_name: "Global Toothgems SAS", vat_number: "FR00900000000", country_code: "FR" },
  buyer: { email: "camille@example.com", order_number: "GT-100042", address: { first_name: "Camille", last_name: "Martin", address_line1: "2 rue X", postal_code: "69002", city: "Lyon", country_code: "FR" } },
  lines: [{ kind: "product", description: "Heart", quantity: 1, unit_price_incl: 19.9, unit_price_excl: 16.58, discount_incl: 0, vat_rate_bp: 2000, total_incl: 19.9, vat_amount: 3.32, total_excl: 16.58 }],
  vat_breakdown: [{ vat_rate_bp: 2000, total_excl: 16.58, vat_amount: 3.32, total_incl: 19.9 }],
  payment: { paid_at: "2026-10-09T07:59:00+00:00", gift_card_amount: 0, charged_amount: 19.9 },
};

export const CREDIT_ROW: InvoiceRowWithRefund = {
  ...INVOICE_ROW,
  id: "av-1",
  kind: "credit_note",
  refund_id: "r-1",
  invoice_number: "AV-2026-000001",
  total_excl_tax: "4.17",
  total_tax: "0.83",
  total_incl_tax: "5.00",
  lines: [{ kind: "adjustment", description: null, quantity: null, vat_rate_bp: 2000, total_incl: 5, vat_amount: 0.83, total_excl: 4.17 }],
  vat_breakdown: [{ vat_rate_bp: 2000, total_excl: 4.17, vat_amount: 0.83, total_incl: 5 }],
  payment: { refunded_at: "2026-10-10T10:00:00+00:00", refund_method: "card", credited_invoice_number: "FA-2026-000001" },
};

