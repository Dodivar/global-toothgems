import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The checkout's persistence boundary: what reaches the payment form, and how
 * every failure of `create-checkout-session` is turned into a reason the cart
 * can explain. A wrong mapping here either opens a payment form with a forged
 * or mismatched secret, or tells a customer "server error" for an
 * out-of-stock basket.
 */

const invoke = vi.fn();
const rpc = vi.fn();
const from = vi.fn();

vi.mock("../supabase/client", () => ({
  requireSupabase: () => ({ functions: { invoke }, rpc, from }),
}));

const { fetchCheckoutStatus, fetchShippingRates, isCheckoutSessionId, isClientSecret, readCheckoutAnswer, releasePaymentStep, startCheckout } = await import(
  "./api"
);

const SECRET = "cs_test_a1B2c3D4e5F6g7H8_secret_abcDEF123456";
const PAYMENT = {
  status: "payment",
  client_secret: SECRET,
  publishable_key: "pk_test_1234567890abcdef",
  order_number: "GT-2026-000123",
  amount_due: 4590,
  discount_amount: 500,
  shipping_amount: 490,
  total_amount: 4590,
  currency: "EUR",
  expires_at: "2026-11-11T22:00:00.000Z",
};

const request = {
  items: [],
  email: "a@example.com",
  address: { first_name: "A", last_name: "B", address_line1: "1 rue", postal_code: "75001", city: "Paris", country_code: "FR" },
  shipping_rate_id: null,
  locale: "fr" as const,
};

function httpError(status: number, body: unknown) {
  const response = new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  return new FunctionsHttpError(response);
}

beforeEach(() => {
  invoke.mockReset();
  rpc.mockReset();
  from.mockReset();
});

describe("readCheckoutAnswer", () => {
  it("opens the payment step with the database's figures", () => {
    const answer = readCheckoutAnswer(PAYMENT);
    expect(answer).toEqual({
      kind: "payment",
      payment: {
        clientSecret: SECRET,
        publishableKey: PAYMENT.publishable_key,
        orderNumber: PAYMENT.order_number,
        amountDue: 4590,
        discountAmount: 500,
        shippingAmount: 490,
        totalAmount: 4590,
        currency: "EUR",
        expiresAt: Date.parse(PAYMENT.expires_at),
      },
    });
  });

  it("never mixes a live key with a test session, or the reverse", () => {
    expect(readCheckoutAnswer({ ...PAYMENT, publishable_key: "pk_live_1234567890abcdef" })).toEqual({ kind: "error", error: "payment_unavailable" });
    expect(readCheckoutAnswer({ ...PAYMENT, client_secret: SECRET.replace("cs_test_", "cs_live_") })).toEqual({
      kind: "error",
      error: "payment_unavailable",
    });
  });

  it.each([
    ["a secret key instead of a publishable one", { publishable_key: "sk_test_1234567890abcdef" }],
    ["a malformed client secret", { client_secret: "cs_test_abc" }],
    ["a zero amount (a free order never opens a card form)", { amount_due: 0 }],
    ["a negative amount", { amount_due: -100 }],
    ["a decimal amount (major units leaked)", { amount_due: 45.9 }],
    ["a lower-case currency", { currency: "eur" }],
    ["no expiry", { expires_at: undefined }],
    ["an unreadable expiry", { expires_at: "tomorrow" }],
    ["no order number", { order_number: 42 }],
  ])("refuses %s", (_, override) => {
    expect(readCheckoutAnswer({ ...PAYMENT, ...override })).toEqual({ kind: "error", error: "payment_unavailable" });
  });

  it("drops a figure it cannot trust instead of showing it", () => {
    const answer = readCheckoutAnswer({ ...PAYMENT, discount_amount: -1, shipping_amount: "4.90", total_amount: undefined });
    expect(answer.kind).toBe("payment");
    if (answer.kind === "payment") {
      expect(answer.payment).toMatchObject({ discountAmount: null, shippingAmount: null, totalAmount: null, amountDue: 4590 });
    }
  });

  it("reads an order paid in full (gift cards) and the function's error codes", () => {
    expect(readCheckoutAnswer({ status: "paid", order_number: "GT-1" })).toEqual({ kind: "paid", orderNumber: "GT-1" });
    expect(readCheckoutAnswer({ error: "out_of_stock" })).toEqual({ kind: "error", error: "out_of_stock" });
    expect(readCheckoutAnswer({ error: "course_consent_required" })).toEqual({ kind: "error", error: "course_consent_required" });
  });

  it("turns an unknown code, an empty body or a paid answer without its number into a server error", () => {
    expect(readCheckoutAnswer({ error: "<script>" })).toEqual({ kind: "error", error: "server_error" });
    expect(readCheckoutAnswer(null)).toEqual({ kind: "error", error: "server_error" });
    expect(readCheckoutAnswer({ status: "paid" })).toEqual({ kind: "error", error: "server_error" });
  });
});

describe("startCheckout", () => {
  it("sends the request to create-checkout-session and reads the payment step", async () => {
    invoke.mockResolvedValue({ data: PAYMENT, error: null });
    const answer = await startCheckout(request);
    expect(invoke).toHaveBeenCalledWith("create-checkout-session", { body: request });
    expect(answer.kind).toBe("payment");
  });

  it("reads the refusal the function sent with its HTTP status", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(409, { error: "out_of_stock" }) });
    expect(await startCheckout(request)).toEqual({ kind: "error", error: "out_of_stock" });
  });

  it("says payment is unavailable when the function is not deployed (404), nothing was created", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(404, "Not found") });
    expect(await startCheckout(request)).toEqual({ kind: "error", error: "payment_unavailable" });
  });

  it("says server error when the error body is not JSON", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(502, "<html>Bad gateway</html>") });
    expect(await startCheckout(request)).toEqual({ kind: "error", error: "server_error" });
  });

  it("says network when the request never reached the function", async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new TypeError("Failed to fetch")) });
    expect(await startCheckout(request)).toEqual({ kind: "error", error: "network" });
  });
});

describe("releasePaymentStep", () => {
  it("asks the function to close the step, and never throws", async () => {
    invoke.mockRejectedValue(new Error("offline"));
    await expect(releasePaymentStep(SECRET)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith("create-checkout-session", { body: { release_client_secret: SECRET } });
  });
});

describe("fetchCheckoutStatus", () => {
  it("reads the order behind a session", async () => {
    rpc.mockResolvedValue({ data: [{ order_number: "GT-1", state: "paid" }], error: null });
    expect(await fetchCheckoutStatus("cs_test_abcdefghij")).toEqual({ orderNumber: "GT-1", state: "paid" });
    expect(rpc).toHaveBeenCalledWith("checkout_session_status", { p_session_id: "cs_test_abcdefghij" });
  });

  it("knows nothing of an unknown session or an unknown state", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchCheckoutStatus("cs_test_abcdefghij")).toBeNull();
    rpc.mockResolvedValue({ data: [{ order_number: "GT-1", state: "refunded" }], error: null });
    expect(await fetchCheckoutStatus("cs_test_abcdefghij")).toBeNull();
  });

  it("throws when the database refuses, so the page can retry", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(fetchCheckoutStatus("cs_test_abcdefghij")).rejects.toThrow();
  });
});

/** A chainable stand-in for one `from(table)` query, resolving to `result`. */
function query(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order"]) chain[method] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe("fetchShippingRates", () => {
  it("uses the country's zone", async () => {
    const tables: Record<string, ReturnType<typeof query>> = {
      shipping_zone_countries: query({ data: { zone_id: "z-fr" }, error: null }),
      shipping_rates: query({ data: [{ id: "r1" }], error: null }),
    };
    from.mockImplementation((table: string) => tables[table]);
    expect(await fetchShippingRates("fr")).toEqual([{ id: "r1" }]);
    expect(tables.shipping_zone_countries.eq).toHaveBeenCalledWith("country_code", "FR");
    expect(tables.shipping_rates.eq).toHaveBeenCalledWith("zone_id", "z-fr");
    expect(tables.shipping_rates.eq).toHaveBeenCalledWith("is_active", true);
  });

  it("falls back to the rest-of-the-world zone, and offers nothing without one", async () => {
    const rates = query({ data: [{ id: "r-world" }], error: null });
    from.mockImplementation((table: string) =>
      table === "shipping_zone_countries" ? query({ data: null, error: null }) : table === "shipping_zones" ? query({ data: { id: "z-world" }, error: null }) : rates,
    );
    expect(await fetchShippingRates("JP")).toEqual([{ id: "r-world" }]);

    from.mockImplementation(() => query({ data: null, error: null }));
    expect(await fetchShippingRates("JP")).toEqual([]);
  });

  it("throws on a database error rather than offering no delivery", async () => {
    from.mockImplementation(() => query({ data: null, error: { message: "down" } }));
    await expect(fetchShippingRates("FR")).rejects.toThrow("down");
  });
});

describe("identifier guards", () => {
  it("accepts only Checkout Session ids and client secrets", () => {
    expect(isCheckoutSessionId("cs_test_abcdefghij")).toBe(true);
    expect(isCheckoutSessionId("cs_live_abcdefghij")).toBe(true);
    expect(isCheckoutSessionId(null)).toBe(false);
    expect(isCheckoutSessionId("pi_test_abcdefghij")).toBe(false);
    expect(isCheckoutSessionId("cs_test_abc'; drop")).toBe(false);
    expect(isClientSecret(SECRET)).toBe(true);
    expect(isClientSecret("cs_test_abcdefghij")).toBe(false);
    expect(isClientSecret(42)).toBe(false);
  });
});
