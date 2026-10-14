import { describe, expect, it } from "vitest";
import {
  type BackInStockRow,
  demandedProducts,
  figuresOf,
  filterRequests,
  readErrorOf,
  rowToRequest,
  stateOf,
} from "./adminBackInStockMapping";

const row = (over: Partial<BackInStockRow> = {}): BackInStockRow => ({
  id: "r-1",
  product_id: "p-1",
  product_name: "Cœur Chrome",
  product_status: "active",
  variant_id: null,
  variant_name: null,
  email: "camille@example.com",
  user_id: null,
  locale: "fr",
  created_at: "2026-10-14T10:00:00Z",
  notified_at: null,
  stock_status: "out_of_stock",
  email_status: null,
  email_attempts: null,
  ...over,
});

describe("stateOf", () => {
  it("reads a request still out of stock as waiting, and back in stock as due", () => {
    expect(stateOf(row())).toBe("waiting");
    expect(stateOf(row({ stock_status: "in_stock" }))).toBe("due");
    expect(stateOf(row({ stock_status: "low_stock" }))).toBe("due");
  });

  it("closes a notified request whatever the stock", () => {
    expect(stateOf(row({ notified_at: "2026-10-14T11:00:00Z", email_status: "delivered", stock_status: "out_of_stock" }))).toBe("notified");
  });

  it("flags an e-mail failed past the attempt cap, but not one still retried", () => {
    expect(stateOf(row({ stock_status: "in_stock", email_status: "failed", email_attempts: 5 }))).toBe("failed");
    expect(stateOf(row({ stock_status: "in_stock", email_status: "failed", email_attempts: 2 }))).toBe("due");
  });

  it("pauses a request whose product is off sale", () => {
    expect(stateOf(row({ product_status: "archived", stock_status: "in_stock" }))).toBe("paused");
  });
});

describe("figures and demand", () => {
  const requests = [
    row({ id: "a" }),
    row({ id: "b", email: "lea@example.com" }),
    row({ id: "c", product_id: "p-2", product_name: "Strass", variant_id: "v-1", variant_name: "SS6", stock_status: "in_stock" }),
    row({ id: "d", notified_at: "2026-10-14T11:00:00Z" }),
    row({ id: "e", product_status: "draft" }),
  ].map(rowToRequest);

  it("counts each state once", () => {
    expect(figuresOf(requests)).toEqual({ waiting: 2, due: 1, notified: 1, attention: 1 });
  });

  it("ranks the open targets by demand, saying which are back", () => {
    expect(demandedProducts(requests)).toEqual([
      { productId: "p-1", productName: "Cœur Chrome", variantName: null, open: 2, back: false },
      { productId: "p-2", productName: "Strass", variantName: "SS6", open: 1, back: true },
    ]);
  });

  it("filters by view and by product, option or address, accents ignored", () => {
    expect(filterRequests(requests, "open", "").map((r) => r.id)).toEqual(["a", "b", "c", "e"]);
    expect(filterRequests(requests, "notified", "").map((r) => r.id)).toEqual(["d"]);
    expect(filterRequests(requests, "all", "coeur").map((r) => r.id)).toEqual(["a", "b", "d", "e"]);
    expect(filterRequests(requests, "all", "ss6").map((r) => r.id)).toEqual(["c"]);
    expect(filterRequests(requests, "all", "LEA@").map((r) => r.id)).toEqual(["b"]);
  });
});

describe("readErrorOf", () => {
  it("tells a refusal from a failure", () => {
    expect(readErrorOf({ code: "42501" })).toBe("forbidden");
    expect(readErrorOf({ message: "admin_back_in_stock_requests: permission denied" })).toBe("forbidden");
    expect(readErrorOf({ code: "08006" })).toBe("error");
  });
});
