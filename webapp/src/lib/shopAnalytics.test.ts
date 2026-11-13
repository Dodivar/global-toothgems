import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.fn();
const posthogState = { loaded: true, optedIn: true };
vi.mock("posthog-js", () => ({
  default: {
    get __loaded() {
      return posthogState.loaded;
    },
    has_opted_in_capturing: () => posthogState.optedIn,
    capture: (...args: unknown[]) => capture(...args),
  },
}));

const { newlyAccepted, trackShop, trackShopOnce } = await import("./shopAnalytics");

describe("shop analytics", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    });
    posthogState.loaded = true;
    posthogState.optedIn = true;
    capture.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends nothing without consent or without PostHog", () => {
    posthogState.optedIn = false;
    trackShop("checkout_started");
    posthogState.optedIn = true;
    posthogState.loaded = false;
    trackShop("checkout_started");
    expect(capture).not.toHaveBeenCalled();
  });

  it("sends an event with its properties once consented", () => {
    trackShop("payment_failed", { stage: "confirm", decline_code: "insufficient_funds" });
    expect(capture).toHaveBeenCalledWith("payment_failed", { stage: "confirm", decline_code: "insufficient_funds" });
  });

  it("counts an order once per key, even across a reload of the page", () => {
    trackShopOnce("order:GT-1", "order_completed", { paid_with: "card" });
    trackShopOnce("order:GT-1", "order_completed", { paid_with: "card" });
    trackShopOnce("order:GT-2", "order_completed", { paid_with: "card" });
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it("writes nothing to storage without consent", () => {
    posthogState.optedIn = false;
    trackShopOnce("order:GT-3", "order_completed");
    expect(window.sessionStorage.getItem("gt-shop-evt:order:GT-3")).toBeNull();
  });

  it("names the promotion codes a quote newly accepted, in upper case", () => {
    expect(newlyAccepted(["SUMMER"], ["SUMMER", "vip10"])).toEqual(["VIP10"]);
    expect(newlyAccepted(["A"], ["A"])).toEqual([]);
    expect(newlyAccepted([], [])).toEqual([]);
  });
});
