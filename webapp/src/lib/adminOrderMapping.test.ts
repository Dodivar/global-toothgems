import { describe, expect, it } from "vitest";
import type { Product } from "../data/products";
import { parseInstant } from "../data/adminOrders";
import { mapAdminOrder, mapAdminOrders, taxesOf, timelineOf, type AdminOrderRow, type PaymentRow } from "./adminOrderMapping";
import { applyFilters, collectedByCurrency, customerOptions, EMPTY_FILTERS, metrics, productOptions } from "./adminOrderFilters";

const PRODUCT = { slug: "aurora-heart", image: "/aurora.jpg" } as unknown as Product;
const findProduct = (slug: string) => (slug === "aurora-heart" ? PRODUCT : undefined);

function stripe(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    provider: "stripe",
    provider_payment_id: "pi_3QabcdefghijklmnopXYZ123",
    provider_checkout_id: "cs_test_a1",
    status: "succeeded",
    amount: "61.80",
    amount_refunded: "0.00",
    payment_method_type: "card",
    card_brand: "visa",
    card_last4: "4242",
    created_at: "2026-09-30T10:00:05.000+00:00",
    updated_at: "2026-09-30T10:02:00.000+00:00",
    gift_card: null,
    ...overrides,
  };
}

/**
 * A paid order as `create_order` records it: two lines at 20 % and 5.5 %
 * VAT, a code discount of 5.00 on the first line, shipping 6.90 (VAT 1.15),
 * a gift card paying 10.00, Stripe collecting the remaining 61.80.
 */
function row(overrides: Partial<AdminOrderRow> = {}): AdminOrderRow {
  return {
    id: "o1",
    order_number: "GT-2026-0001",
    user_id: "u1",
    customer_email: "nora@example.com",
    created_at: "2026-09-30T09:58:00.000+00:00",
    updated_at: "2026-10-01T08:00:00.000+00:00",
    paid_at: "2026-09-30T10:02:00.000+00:00",
    cancelled_at: null,
    status: "confirmed",
    payment_status: "paid",
    fulfillment_status: "unfulfilled",
    currency: "EUR",
    subtotal_amount: "69.90",
    discount_amount: "5.00",
    shipping_amount: "6.90",
    tax_amount: "11.81",
    total_amount: "71.80",
    gift_card_amount: "10.00",
    amount_due: "61.80",
    prices_include_tax: true,
    shipping_method_name: "Colissimo",
    billing_address: { first_name: "Nora", last_name: "Belkacem", address_line1: "1 rue A", postal_code: "75001", city: "Paris", country_code: "fr", phone: "+33 6 00 00 00 00" },
    shipping_address: { first_name: "Léa", last_name: "Martin", address_line1: "2 rue B", postal_code: "69001", city: "Lyon", country_code: "FR" },
    order_items: [
      { id: "i1", product_name: "Aurora Heart", variant_name: "Rose", unit_price: "29.95", quantity: 2, discount_amount: "5.00", tax_rate_bp: 2000, tax_amount: "9.15", product: { slug: "aurora-heart" } },
      { id: "i2", product_name: "Guide", variant_name: null, unit_price: "10.00", quantity: 1, discount_amount: "0.00", tax_rate_bp: 550, tax_amount: "0.52", product: null },
    ],
    order_discounts: [{ label: "Rentrée", code: "RENTREE", goods_amount: "5.00", shipping_amount: "0.00", source: "promotion" }],
    shipments: [],
    refunds: [],
    payments: [
      stripe({ status: "failed", provider_payment_id: null, provider_checkout_id: "cs_test_a0", created_at: "2026-09-30T09:58:30.000+00:00", updated_at: "2026-09-30T09:59:40.000+00:00", card_brand: null, card_last4: null }),
      stripe(),
      { ...stripe(), provider: "gift_card", provider_payment_id: null, provider_checkout_id: null, amount: "10.00", payment_method_type: "gift_card", card_brand: null, card_last4: null, created_at: "2026-09-30T09:58:00.000+00:00", gift_card: { code_last4: "7KQ2" } },
    ],
    ...overrides,
  };
}

describe("mapAdminOrder: amounts as recorded", () => {
  it("keeps every amount in integer minor units, never recomputed", () => {
    const order = mapAdminOrder(row(), findProduct);
    expect(order.currency).toBe("EUR");
    expect(order.amounts).toEqual({
      subtotal: 6990,
      discount: 500,
      shipping: 690,
      tax: 1181,
      taxIncluded: true,
      total: 7180,
      giftCard: 1000,
      charged: 6180,
      refunded: 0,
    });
  });

  it("maps lines with their own price, discount and VAT", () => {
    const [first, second] = mapAdminOrder(row(), findProduct).lines;
    expect(first).toMatchObject({ id: "i1", productId: "aurora-heart", image: "/aurora.jpg", unitAmount: 2995, totalAmount: 5990, discountAmount: 500, taxRateBp: 2000, taxAmount: 915, qty: 2 });
    // Deleted from the shop: no link, the snapshot name stays.
    expect(second).toMatchObject({ id: "i2", productId: undefined, name: { fr: "Guide", en: "Guide" }, taxRateBp: 550, taxAmount: 52 });
  });

  it("lists discounts with their code and source, and gift cards by their last four", () => {
    const order = mapAdminOrder(row(), findProduct);
    expect(order.discounts).toEqual([{ label: "Rentrée", code: "RENTREE", goodsAmount: 500, shippingAmount: 0, source: "promotion" }]);
    expect(order.giftCards).toEqual([{ last4: "7KQ2", amount: 1000, status: "succeeded" }]);
  });

  it("reads the loyalty reward as a loyalty discount", () => {
    const order = mapAdminOrder(
      row({ order_discounts: [{ label: "Carte fidélité", code: null, goods_amount: "5.00", shipping_amount: "0.00", source: "loyalty" }] }),
      findProduct,
    );
    expect(order.discounts[0]).toMatchObject({ source: "loyalty", code: undefined, goodsAmount: 500 });
  });

  it("shows the Stripe payment that collected money, not the failed attempt or the gift card", () => {
    const { payment } = mapAdminOrder(row(), findProduct);
    expect(payment).toEqual({
      method: "visa",
      last4: "4242",
      status: "paid",
      reference: "pi_3QabcdefghijklmnopXYZ123",
      capturedAt: "2026-09-30T10:02:00.000+00:00",
      captured: 6180,
      refunded: 0,
    });
  });

  it("keeps both address snapshots and names the buyer from the billing address", () => {
    const order = mapAdminOrder(row(), findProduct);
    expect(order.billingAddress).toMatchObject({ name: "Nora Belkacem", city: "Paris", countryCode: "FR" });
    expect(order.shippingAddress).toMatchObject({ name: "Léa Martin", city: "Lyon", countryCode: "FR" });
    expect(order.customer).toMatchObject({ id: "u1", firstName: "Nora", lastName: "Belkacem", phone: "+33 6 00 00 00 00" });
    expect(order.shippingMethod).toBe("standard");
    expect(order.shippingMethodName).toBe("Colissimo");
  });

  it("names a guest by e-mail and marks an order without shipping address digital", () => {
    const order = mapAdminOrder(
      row({ user_id: null, customer_email: "Guest@Example.com", billing_address: null, shipping_address: null }),
      findProduct,
    );
    expect(order.customer).toMatchObject({ id: "guest:guest@example.com", firstName: "Guest", lastName: "" });
    expect(order.shippingMethod).toBe("digital");
  });

  it("flags a failed payment, unless the order was cancelled", () => {
    expect(mapAdminOrder(row({ payment_status: "failed", status: "pending" }), findProduct).attention).toBe("paymentFailed");
    expect(mapAdminOrder(row({ payment_status: "failed", status: "cancelled" }), findProduct).attention).toBeUndefined();
  });
});

describe("taxesOf: VAT by rate", () => {
  it("groups the lines' VAT by rate and shows what remains as the shipping's VAT, without a rate", () => {
    expect(taxesOf(row())).toEqual([
      { rateBp: 2000, amount: 915 },
      { rateBp: 550, amount: 52 },
      { rateBp: null, amount: 214 },
    ]);
  });

  it("adds lines at the same rate and leaves out zero-VAT lines", () => {
    const items = row().order_items;
    expect(
      taxesOf({
        tax_amount: "10.00",
        order_items: [
          { ...items[0], tax_amount: "4.00" },
          { ...items[0], id: "i3", tax_amount: "6.00" },
          { ...items[1], tax_rate_bp: 0, tax_amount: "0.00" },
        ],
      }),
    ).toEqual([{ rateBp: 2000, amount: 1000 }]);
  });
});

describe("parcels and refunds", () => {
  const shipped = row({
    status: "shipped",
    fulfillment_status: "fulfilled",
    shipments: [
      {
        id: "s1",
        status: "shipped",
        carrier: "Colissimo",
        service: "Suivi",
        tracking_number: "6A123",
        tracking_url: "https://www.laposte.fr/outils/suivre-vos-envois?code=6A123",
        estimated_delivery: "2026-10-03",
        shipped_at: "2026-10-01T07:30:00.000+00:00",
        delivered_at: null,
        created_at: "2026-09-30T16:00:00.000+00:00",
        shipment_items: [{ order_item_id: "i1", quantity: 2 }],
      },
    ],
    refunds: [
      { amount: "10.00", status: "succeeded", reason: "goodwill", created_at: "2026-10-02T09:00:00.000+00:00", processed_at: "2026-10-02T09:05:00.000+00:00", refund_items: [] },
      { amount: "5.00", status: "pending", reason: "return", created_at: "2026-10-03T09:00:00.000+00:00", processed_at: null, refund_items: [{ order_item_id: "i2", quantity: 1 }] },
    ],
  });

  it("maps parcels with their contents and tracking", () => {
    const order = mapAdminOrder(shipped, findProduct);
    expect(order.parcels).toEqual([
      {
        id: "s1",
        status: "shipped",
        carrier: "Colissimo",
        service: "Suivi",
        trackingNumber: "6A123",
        trackingUrl: "https://www.laposte.fr/outils/suivre-vos-envois?code=6A123",
        estimatedDelivery: "2026-10-03",
        shippedOn: "2026-10-01",
        deliveredOn: undefined,
        items: [{ lineId: "i1", qty: 2 }],
      },
    ]);
    expect(order.shipment).toMatchObject({ carrier: "Colissimo", number: "6A123", estimatedDelivery: "2026-10-03" });
  });

  it("lists every refund, newest first, and counts only the succeeded ones as refunded", () => {
    const order = mapAdminOrder(shipped, findProduct);
    expect(order.refunds.map((r) => [r.status, r.amount, r.reason])).toEqual([
      ["pending", 500, "return"],
      ["succeeded", 1000, "goodwill"],
    ]);
    expect(order.refunds[0].items).toEqual([{ lineId: "i2", qty: 1 }]);
    expect(order.amounts.refunded).toBe(1000);
  });
});

describe("timelineOf: dated by the facts, never by updated_at", () => {
  it("dates each event from its own column, oldest first", () => {
    const events = timelineOf(
      row({
        shipments: [
          { id: "s1", status: "delivered", carrier: "DHL", service: null, tracking_number: "1", tracking_url: null, estimated_delivery: null, shipped_at: "2026-10-01T07:30:00Z", delivered_at: "2026-10-02T12:00:00Z", created_at: "2026-09-30T16:00:00Z", shipment_items: [] },
        ],
        refunds: [
          { amount: "20.00", status: "succeeded", reason: "goodwill", created_at: "2026-10-03T09:00:00Z", processed_at: "2026-10-03T09:05:00Z", refund_items: [] },
          { amount: "41.80", status: "succeeded", reason: "return", created_at: "2026-10-04T09:00:00Z", processed_at: "2026-10-04T10:00:00Z", refund_items: [] },
          { amount: "1.00", status: "failed", reason: "other", created_at: "2026-10-05T09:00:00Z", processed_at: "2026-10-05T09:01:00Z", refund_items: [] },
        ],
      }),
      6180,
    );
    expect(events).toEqual([
      { kind: "placed", at: "2026-09-30T09:58:00.000+00:00" },
      { kind: "paymentFailed", at: "2026-09-30T09:59:40.000+00:00" },
      { kind: "paymentConfirmed", at: "2026-09-30T10:02:00.000+00:00" },
      { kind: "shipped", at: "2026-10-01T07:30:00Z" },
      { kind: "delivered", at: "2026-10-02T12:00:00Z" },
      { kind: "refundRequested", at: "2026-10-03T09:00:00Z" },
      { kind: "partiallyRefunded", at: "2026-10-03T09:05:00Z" },
      { kind: "refundRequested", at: "2026-10-04T09:00:00Z" },
      { kind: "refunded", at: "2026-10-04T10:00:00Z" },
      { kind: "refundRequested", at: "2026-10-05T09:00:00Z" },
      { kind: "refundFailed", at: "2026-10-05T09:01:00Z" },
    ]);
    expect(events.map((e) => e.at)).not.toContain("2026-10-01T08:00:00.000+00:00");
  });

  it("uses cancelled_at for a cancellation, and invents nothing when a date is missing", () => {
    const events = timelineOf(row({ status: "cancelled", paid_at: null, cancelled_at: "2026-09-30T11:00:00Z", payments: [] }), 0);
    expect(events).toEqual([
      { kind: "placed", at: "2026-09-30T09:58:00.000+00:00" },
      { kind: "cancelled", at: "2026-09-30T11:00:00Z" },
    ]);
    // A status set by hand without any dated fact leaves only "placed".
    expect(timelineOf(row({ status: "processing", paid_at: null, payments: [] }), 0)).toHaveLength(1);
  });
});

describe("notes", () => {
  it("reads the staff note from order_notes", () => {
    const fromTable = mapAdminOrder(row(), findProduct, { body: "Léa · 2026-10-01 08:00 UTC\nAppelée", updated_at: "2026-10-01T08:00:00Z" });
    expect(fromTable.notes).toEqual([
      { id: "GT-2026-0001-notes", author: "", at: "2026-10-01T08:00:00Z", body: { fr: "Léa · 2026-10-01 08:00 UTC\nAppelée", en: "Léa · 2026-10-01 08:00 UTC\nAppelée" } },
    ]);
    expect(mapAdminOrder(row(), findProduct).notes).toEqual([]);
  });
});

describe("the book: buyers, KPIs and currencies", () => {
  const book = mapAdminOrders(
    [
      row(),
      row({ id: "o2", order_number: "GT-2026-0002", created_at: "2026-09-29T09:00:00Z", payment_status: "partially_refunded", refunds: [{ amount: "11.80", status: "succeeded", reason: "goodwill", created_at: "2026-10-01T09:00:00Z", processed_at: "2026-10-01T09:01:00Z", refund_items: [] }] }),
      row({ id: "o3", order_number: "GT-2026-0003", status: "cancelled", payment_status: "paid" }),
      row({ id: "o4", order_number: "GT-2026-0004", payment_status: "pending", paid_at: null, payments: [] }),
      row({ id: "o5", order_number: "GT-2026-0005", user_id: "u2", currency: "CHF", total_amount: "100.00", gift_card_amount: "0.00", amount_due: "100.00", payments: [stripe({ amount: "100.00" })] }),
    ],
    findProduct,
  );

  it("never adds currencies, and counts only collected money of orders that stand", () => {
    // EUR: o1 61.80 + o2 (61.80 − 11.80) = 111.80; o3 cancelled, o4 unpaid. CHF apart.
    expect(collectedByCurrency(book)).toEqual([
      { currency: "CHF", amount: 10000 },
      { currency: "EUR", amount: 11180 },
    ]);
    expect(metrics(book).revenue).toEqual(collectedByCurrency(book));
  });

  it("gives each buyer their count, first order and net spend per currency", () => {
    const nora = book.find((o) => o.reference === "GT-2026-0001")!.customer;
    expect(nora.orderCount).toBe(4);
    expect(nora.since).toBe("2026-09-29");
    // Spent = recorded totals of paid orders that stand, less refunds: 71.80 + (71.80 − 11.80).
    expect(nora.spend).toEqual([{ currency: "EUR", amount: 13180 }]);
  });

  it("sorts totals within a currency and never across", () => {
    const sorted = applyFilters(book, { ...EMPTY_FILTERS, sort: "totalDesc" }, "2026-10-01");
    expect(sorted.map((o) => o.currency)).toEqual(["CHF", "EUR", "EUR", "EUR", "EUR"]);
  });

  it("offers the book's own buyers and products as filter options", () => {
    expect(customerOptions(book).map((o) => o.value).sort()).toEqual(["u1", "u2"]);
    expect(productOptions(book, "fr")).toEqual([{ value: "aurora-heart", label: "Aurora Heart" }]);
  });
});

describe("parseInstant", () => {
  it("reads database timestamps and bare local datetimes", () => {
    expect(parseInstant("2026-09-30T10:02:00.000+00:00").toISOString()).toBe("2026-09-30T10:02:00.000Z");
    expect(Number.isNaN(parseInstant("2026-09-30T10:02").getTime())).toBe(false);
  });
});
