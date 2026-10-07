import { describe, expect, it } from "vitest";
import type { Product } from "../data/products";
import { SEED_ORDERS, isActiveOrder, isShipment, shipmentStep, spentByCurrency, type Order } from "../data/orders";
import {
  isCustomerVisible,
  mapAddress,
  mapFulfilment,
  mapOrder,
  mapOrderStatus,
  mapPaymentState,
  type OrderRow,
} from "./orderMapping";

const product = { id: "coeur-chrome", image: "https://cdn.example/coeur.jpg" } as Product;
const find = (slug: string) => (slug === product.id ? product : undefined);

const address = {
  first_name: "Camille",
  last_name: "Roussel",
  address_line1: "12 rue des Lilas",
  address_line2: "Bât. B",
  postal_code: "69003",
  city: "Lyon",
  country_code: "fr",
};

/**
 * 2 × 41.00 + 1 × 9.95 = 91.95; WELCOME10 took 9.20 off the goods; shipping
 * 6.90 charged; a gift card paid 20.00; VAT included. Totals come from the
 * row, never from the lines.
 */
const row: OrderRow = {
  order_number: "GT-100149",
  created_at: "2026-09-29T10:12:00+00:00",
  status: "delivered",
  payment_status: "partially_refunded",
  fulfillment_status: "fulfilled",
  currency: "EUR",
  subtotal_amount: "91.95",
  discount_amount: "9.20",
  shipping_amount: 6.9,
  tax_amount: "14.95",
  total_amount: "89.65",
  gift_card_amount: "20.00",
  amount_due: "69.65",
  prices_include_tax: true,
  shipping_method_name: "Colissimo Suivi",
  billing_address: address,
  shipping_address: address,
  order_items: [
    { id: "i1", product_name: "Cœur Chrome", variant_name: null, unit_price: "41.00", quantity: 2, discount_amount: "8.20", product: { slug: "coeur-chrome" } },
    { id: "i2", product_name: "Ancien produit", variant_name: "SS6", unit_price: 9.95, quantity: 1, discount_amount: "1.00", product: { slug: "retired" } },
  ],
  order_discounts: [
    { label: "Bienvenue −10 %", code: "WELCOME10", goods_amount: "9.20", shipping_amount: 0 },
    { label: "Livraison offerte", code: null, goods_amount: 0, shipping_amount: "0.00" },
  ],
  shipments: [
    {
      id: "s-old", status: "cancelled", carrier: "DHL", service: null, tracking_number: "OLD123", tracking_url: null,
      estimated_delivery: null, shipped_at: null, delivered_at: null, created_at: "2026-09-29T11:00:00Z", shipment_items: [],
    },
    {
      id: "s1", status: "delivered", carrier: "Colissimo", service: "Expert", tracking_number: "6A21",
      tracking_url: "https://www.laposte.fr/outils/suivre-vos-envois?code=6A21", estimated_delivery: "2026-10-02",
      shipped_at: "2026-09-30T08:00:00Z", delivered_at: "2026-10-01T15:00:00Z", created_at: "2026-09-29T10:30:00Z",
      shipment_items: [{ order_item_id: "i1", quantity: 2 }, { order_item_id: "i2", quantity: 1 }],
    },
  ],
  refunds: [
    { amount: "9.95", status: "succeeded", reason: "defective", created_at: "2026-10-03T09:00:00Z", processed_at: "2026-10-04T09:00:00Z", refund_items: [{ order_item_id: "i2", quantity: 1 }] },
    { amount: "5.00", status: "pending", reason: "goodwill", created_at: "2026-10-05T09:00:00Z", processed_at: null, refund_items: [] },
    { amount: "1.00", status: "failed", reason: "unknown_reason", created_at: "2026-10-02T09:00:00Z", processed_at: null, refund_items: [] },
  ],
};

describe("mapOrder — line photo", () => {
  const withVariants = {
    ...product,
    variants: [
      { id: "v-yellow", image: "https://cdn.example/yellow.jpg" },
      { id: "v-white", image: "https://cdn.example/white.jpg" },
      { id: "v-bare" },
    ],
  } as Product;
  const photo = (variantId: string | null) =>
    mapOrder(
      { ...row, order_items: [{ ...row.order_items[0], variant_id: variantId }] },
      () => withVariants,
    ).lines[0].image;

  it("shows the photo of the variant bought", () => {
    expect(photo("v-white")).toBe("https://cdn.example/white.jpg");
    expect(photo("v-yellow")).toBe("https://cdn.example/yellow.jpg");
  });

  it("falls back to the product photo when the variant has none or is gone", () => {
    expect(photo("v-bare")).toBe(product.image);
    expect(photo("deleted")).toBe(product.image);
    expect(photo(null)).toBe(product.image);
  });
});

describe("mapOrder — gift card lines", () => {
  const design = (gift_cards: unknown) =>
    mapOrder({ ...row, order_items: [{ ...row.order_items[0], gift_cards } as never] }, find).lines[0].giftCardDesign;

  it("carries the design the buyer chose, whether the API sends one card or a list", () => {
    expect(design([{ design: "noir" }])).toBe("noir");
    expect(design({ design: "blush" })).toBe("blush");
  });

  it("has no design for an ordinary line", () => {
    expect(design([])).toBeUndefined();
    expect(design(null)).toBeUndefined();
  });
});

describe("mapOrder — amounts", () => {
  it("takes every amount as recorded, in integer minor units", () => {
    const { amounts, currency } = mapOrder(row, find);
    expect(currency).toBe("EUR");
    expect(amounts).toEqual({
      subtotal: 9195,
      discount: 920,
      shipping: 690,
      tax: 1495,
      taxIncluded: true,
      total: 8965,
      giftCard: 2000,
      charged: 6965,
      refunded: 995, // succeeded refunds only
    });
    for (const value of Object.values(amounts)) {
      if (typeof value === "number") expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("never rebuilds the total from the lines", () => {
    const linesSum = mapOrder(row, find).lines.reduce((sum, l) => sum + l.totalAmount, 0);
    expect(linesSum).toBe(9195);
    expect(mapOrder(row, find).amounts.total).toBe(8965);
  });

  it("derives the card part from the total when the generated column is absent", () => {
    expect(mapOrder({ ...row, amount_due: null }, find).amounts.charged).toBe(6965);
  });

  it("keeps the discounts as named at purchase time", () => {
    expect(mapOrder(row, find).discounts).toEqual([
      { label: "Bienvenue −10 %", code: "WELCOME10", goodsAmount: 920, shippingAmount: 0 },
      { label: "Livraison offerte", code: undefined, goodsAmount: 0, shippingAmount: 0 },
    ]);
  });
});

describe("mapOrder — lines, parcels, refunds, addresses", () => {
  it("keeps the purchase-time snapshot and links products still in the shop", () => {
    const order = mapOrder(row, find);
    expect(order.reference).toBe("GT-100149");
    expect(order.placedOn).toBe("2026-09-29");
    expect(order.lines[0]).toMatchObject({ id: "i1", productId: "coeur-chrome", unitAmount: 4100, totalAmount: 8200, discountAmount: 820, qty: 2, image: product.image });
    expect(order.lines[0].name).toEqual({ fr: "Cœur Chrome", en: "Cœur Chrome" });
    expect(order.lines[1]).toMatchObject({ productId: undefined, unitAmount: 995, image: "" });
    expect(order.lines[1].variant).toEqual({ fr: "SS6", en: "SS6" });
  });

  it("links a course line to its course, never to the shop", () => {
    const course = { id: "i3", product_name: "Pose professionnelle", variant_name: null, unit_price: "349.00", quantity: 1,
      discount_amount: "0.00", product: null, course: { slug: "pose-professionnelle" } };
    const order = mapOrder({ ...row, order_items: [course] }, find);
    expect(order.lines[0]).toMatchObject({ productId: undefined, courseId: "pose-professionnelle", unitAmount: 34900, qty: 1 });
  });

  it("lists the parcels oldest first with their contents and a safe tracking link", () => {
    const [parcel, cancelled] = mapOrder(row, find).parcels;
    expect(cancelled).toMatchObject({ id: "s-old", status: "cancelled", trackingUrl: undefined });
    expect(parcel).toMatchObject({
      status: "delivered",
      carrier: "Colissimo",
      service: "Expert",
      trackingNumber: "6A21",
      shippedOn: "2026-09-30",
      deliveredOn: "2026-10-01",
      items: [{ lineId: "i1", qty: 2 }, { lineId: "i2", qty: 1 }],
    });
    expect(mapOrder({ ...row, shipments: [{ ...row.shipments[1], tracking_url: "http://evil.example" }] }, find).parcels[0].trackingUrl).toBeUndefined();
  });

  it("follows the latest parcel that is actually on its way", () => {
    expect(mapOrder(row, find).tracking).toEqual({
      carrier: "Colissimo",
      number: "6A21",
      url: "https://www.laposte.fr/outils/suivre-vos-envois?code=6A21",
      estimatedDelivery: "2026-10-01",
    });
    expect(mapOrder({ ...row, shipments: [] }, find).tracking).toBeUndefined();
  });

  it("lists refunds newest first, unknown values made safe", () => {
    const refunds = mapOrder(row, find).refunds;
    expect(refunds.map((r) => [r.amount, r.status, r.reason])).toEqual([
      [500, "pending", "goodwill"],
      [995, "succeeded", "defective"],
      [100, "failed", "other"],
    ]);
    expect(refunds[1]).toMatchObject({ requestedOn: "2026-10-03", processedOn: "2026-10-04", items: [{ lineId: "i2", qty: 1 }] });
  });

  it("reads the address snapshots", () => {
    const order = mapOrder(row, find);
    expect(order.shippingAddress).toEqual({
      name: "Camille Roussel",
      company: undefined,
      lines: ["12 rue des Lilas", "Bât. B"],
      postalCode: "69003",
      city: "Lyon",
      region: undefined,
      countryCode: "FR",
      phone: undefined,
    });
    expect(mapAddress(null)).toBeUndefined();
    const digital = mapOrder({ ...row, shipping_address: null, status: "confirmed" }, find);
    expect(digital.ships).toBe(false);
    expect(digital.shippingAddress).toBeUndefined();
    expect(digital.status).toBe("confirmed");
    expect(isShipment(digital)).toBe(false);
  });
});

describe("order states — three independent axes", () => {
  it("words the commercial status, refunds included", () => {
    expect(mapOrderStatus("pending", true)).toBe("processing");
    expect(mapOrderStatus("confirmed", true)).toBe("processing");
    expect(mapOrderStatus("processing", true)).toBe("processing");
    expect(mapOrderStatus("confirmed", false)).toBe("confirmed");
    expect(mapOrderStatus("shipped", true)).toBe("shipped");
    expect(mapOrderStatus("delivered", true)).toBe("delivered");
    expect(mapOrderStatus("cancelled", true)).toBe("cancelled");
    expect(mapOrderStatus("refunded", true)).toBe("refunded");
  });

  it("keeps the payment state apart", () => {
    expect(mapPaymentState("paid")).toBe("paid");
    expect(mapPaymentState("partially_refunded")).toBe("partiallyRefunded");
    expect(mapPaymentState("refunded")).toBe("refunded");
    const order = mapOrder(row, find);
    expect(order.status).toBe("delivered");
    expect(order.payment).toBe("partiallyRefunded");
  });

  it("keeps the fulfilment apart", () => {
    expect(mapFulfilment("unfulfilled")).toBe("unfulfilled");
    expect(mapFulfilment("preparing")).toBe("preparing");
    expect(mapFulfilment("partially_fulfilled")).toBe("partiallyShipped");
    expect(mapFulfilment("fulfilled")).toBe("shipped");
  });

  it("puts a partly shipped order on the 'shipped' step", () => {
    const order = mapOrder({ ...row, status: "processing", fulfillment_status: "partially_fulfilled" }, find);
    expect(shipmentStep(order)).toBe(1);
    expect(shipmentStep(mapOrder({ ...row, status: "processing", fulfillment_status: "preparing" }, find))).toBe(0);
    expect(shipmentStep(mapOrder(row, find))).toBe(2);
  });

  it("treats refunded and cancelled orders as no longer standing", () => {
    expect(isActiveOrder({ status: "refunded" })).toBe(false);
    expect(isActiveOrder({ status: "cancelled" })).toBe(false);
    expect(isActiveOrder({ status: "delivered" })).toBe(true);
  });

  it("hides checkouts that were never paid", () => {
    expect(isCustomerVisible({ payment_status: "pending" })).toBe(false);
    expect(isCustomerVisible({ payment_status: "failed" })).toBe(false);
    expect(isCustomerVisible({ payment_status: "paid" })).toBe(true);
    expect(isCustomerVisible({ payment_status: "partially_refunded" })).toBe(true);
    expect(isCustomerVisible({ payment_status: "refunded" })).toBe(true);
  });
});

describe("spentByCurrency", () => {
  const withAmounts = (currency: string, total: number, refunded: number, status: Order["status"] = "delivered"): Order => ({
    ...SEED_ORDERS[0],
    status,
    currency,
    amounts: { ...SEED_ORDERS[0].amounts, total, refunded },
  });

  it("adds recorded totals less refunds, per currency, never across currencies", () => {
    expect(
      spentByCurrency([
        withAmounts("EUR", 8965, 995),
        withAmounts("EUR", 1000, 0),
        withAmounts("CHF", 5000, 0),
        withAmounts("EUR", 7000, 0, "cancelled"),
        withAmounts("EUR", 3000, 3000, "refunded"),
      ]),
    ).toEqual([
      { currency: "CHF", amount: 5000 },
      { currency: "EUR", amount: 8970 },
    ]);
  });

  it("is empty without orders", () => {
    expect(spentByCurrency([])).toEqual([]);
  });
});

describe("mock history", () => {
  it("is built in minor units, the recorded total matching its lines and shipping", () => {
    for (const order of SEED_ORDERS) {
      const lines = order.lines.reduce((sum, l) => sum + l.totalAmount, 0);
      expect(order.amounts.total).toBe(lines + order.amounts.shipping);
      expect(Number.isInteger(order.amounts.total)).toBe(true);
    }
    expect(SEED_ORDERS.find((o) => o.reference === "GT-2026-0129")?.lines[0].unitAmount).toBe(16900);
  });
});
