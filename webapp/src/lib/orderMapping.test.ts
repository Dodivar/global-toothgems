import { describe, expect, it } from "vitest";
import type { Product } from "../data/products";
import { isCustomerVisible, mapOrder, mapOrderStatus, type OrderRow } from "./orderMapping";

const product = { id: "coeur-chrome", image: "https://cdn.example/coeur.jpg" } as Product;
const find = (slug: string) => (slug === product.id ? product : undefined);

const row: OrderRow = {
  order_number: "GT-100149",
  created_at: "2026-09-29T10:12:00+00:00",
  status: "delivered",
  payment_status: "paid",
  currency: "EUR",
  shipping_amount: "6.90",
  order_items: [
    { product_name: "Cœur Chrome", variant_name: null, unit_price: "41.00", quantity: 2, product: { slug: "coeur-chrome" } },
    { product_name: "Ancien produit", variant_name: "SS6", unit_price: 9.95, quantity: 1, product: { slug: "retired" } },
  ],
  shipments: [
    { status: "cancelled", carrier: "DHL", tracking_number: "OLD123", estimated_delivery: null, delivered_at: null, created_at: "2026-09-29T11:00:00Z" },
    { status: "delivered", carrier: "Colissimo", tracking_number: "6A21", estimated_delivery: "2026-10-02", delivered_at: null, created_at: "2026-09-29T10:30:00Z" },
  ],
};

describe("mapOrder", () => {
  it("keeps the purchase-time snapshot and links products still in the shop", () => {
    const order = mapOrder(row, find);
    expect(order.reference).toBe("GT-100149");
    expect(order.placedOn).toBe("2026-09-29");
    expect(order.status).toBe("delivered");
    expect(order.shipping).toBe(6.9);
    expect(order.lines[0]).toMatchObject({ productId: "coeur-chrome", unitPrice: 41, qty: 2, image: product.image });
    expect(order.lines[0].name).toEqual({ fr: "Cœur Chrome", en: "Cœur Chrome" });
    expect(order.lines[1]).toMatchObject({ productId: undefined, unitPrice: 9.95, image: "" });
    expect(order.lines[1].variant).toEqual({ fr: "SS6", en: "SS6" });
  });

  it("follows the latest parcel that is actually on its way", () => {
    expect(mapOrder(row, find).tracking).toEqual({ carrier: "Colissimo", number: "6A21", estimatedDelivery: "2026-10-02" });
    expect(mapOrder({ ...row, shipments: [] }, find).tracking).toBeUndefined();
  });
});

describe("order status", () => {
  it("words paid-but-unshipped as processing and refunds as cancelled", () => {
    expect(mapOrderStatus("confirmed")).toBe("processing");
    expect(mapOrderStatus("processing")).toBe("processing");
    expect(mapOrderStatus("shipped")).toBe("shipped");
    expect(mapOrderStatus("refunded")).toBe("cancelled");
  });

  it("hides checkouts that were never paid", () => {
    expect(isCustomerVisible({ payment_status: "pending" })).toBe(false);
    expect(isCustomerVisible({ payment_status: "failed" })).toBe(false);
    expect(isCustomerVisible({ payment_status: "paid" })).toBe(true);
    expect(isCustomerVisible({ payment_status: "partially_refunded" })).toBe(true);
  });
});
