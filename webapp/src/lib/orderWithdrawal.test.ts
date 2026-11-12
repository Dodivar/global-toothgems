import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WithdrawalLine } from "./orderWithdrawalMapping";

/**
 * The withdrawal function's persistence boundary (decision 131, L221-21): the
 * declaration a member or a guest sends, and the reasons the shop's screens
 * show when the function or the database refuses. A wrong mapping tells a
 * consumer their legal withdrawal "failed" without saying why.
 */

const invoke = vi.fn();
const rpc = vi.fn();
const from = vi.fn();

vi.mock("./supabase/client", () => ({ supabase: { functions: { invoke }, rpc, from } }));

const {
  declareAsMember,
  declareWithLink,
  fetchOptionsWithLink,
  fetchWithdrawalOptions,
  markReturnReceived,
  refuseWithdrawal,
  requestWithdrawalLink,
  withdrawalAvailable,
} = await import("./orderWithdrawal");

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

const line = { orderItemId: "l1", withdrawable: 2, excluded: null, hygieneSeal: true } as unknown as WithdrawalLine;
const declaration = {
  customerName: "  Camille Bernard  ",
  lines: [line],
  choices: { l1: { quantity: 1, sealOpened: false } },
  asConsumer: true,
  locale: "fr" as const,
};

beforeEach(() => {
  invoke.mockReset();
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("declaring a withdrawal", () => {
  it("is offered only with the database", () => {
    expect(withdrawalAvailable()).toBe(true);
  });

  it("a member declares on their order, name trimmed, as a consumer", async () => {
    invoke.mockResolvedValue({ data: { withdrawal: { id: "w1", declared_at: "2026-11-11T10:00:00Z" } }, error: null });
    expect(await declareAsMember("o1", declaration)).toEqual({ kind: "declared", id: "w1", declaredAt: "2026-11-11T10:00:00Z" });
    const [name, { body }] = invoke.mock.calls[0];
    expect(name).toBe("order-withdrawal");
    expect(body).toMatchObject({ action: "declare", order_id: "o1", customer_name: "Camille Bernard", as_consumer: true, locale: "fr" });
    expect(body.items).toEqual([{ order_item_id: "l1", quantity: 1, seal_opened: false }]);
    expect(body).not.toHaveProperty("token");
  });

  it("a guest declares with the e-mailed link's token, never an order id", async () => {
    invoke.mockResolvedValue({ data: { withdrawal: { id: "w2" } }, error: null });
    const answer = await declareWithLink("tok", declaration);
    expect(answer.kind).toBe("declared");
    const { body } = invoke.mock.calls[0][1];
    expect(body.token).toBe("tok");
    expect(body).not.toHaveProperty("order_id");
  });

  it("shows the function's refusal reason", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(409, { error: "deadline_passed" }) });
    const answer = await declareAsMember("o1", declaration);
    expect(answer.kind).toBe("error");
    if (answer.kind === "error") expect(answer.error).not.toBe("unavailable");
  });

  it("says unavailable for an unknown code, a body that is not JSON, a network failure or an answer without an id", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(500, { error: "drop table" }) });
    expect(await declareAsMember("o1", declaration)).toEqual({ kind: "error", error: "unavailable" });
    invoke.mockResolvedValue({ data: null, error: httpError(502, "<html>") });
    expect(await declareAsMember("o1", declaration)).toEqual({ kind: "error", error: "unavailable" });
    invoke.mockResolvedValue({ data: null, error: new FunctionsFetchError(new TypeError("offline")) });
    expect(await declareAsMember("o1", declaration)).toEqual({ kind: "error", error: "unavailable" });
    invoke.mockResolvedValue({ data: { withdrawal: {} }, error: null });
    expect(await declareAsMember("o1", declaration)).toEqual({ kind: "error", error: "unavailable" });
  });
});

describe("the guest's link", () => {
  it("sends the request trimmed, with the captcha only when there is one", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await requestWithdrawalLink({ orderNumber: " GT-1 ", email: " a@example.com ", locale: "en" })).toEqual({ kind: "sent" });
    expect(invoke.mock.calls[0][1].body).toEqual({ action: "request_link", order_number: "GT-1", email: "a@example.com", locale: "en" });

    await requestWithdrawalLink({ orderNumber: "GT-1", email: "a@example.com", locale: "fr", captcha: "t0k", website: "" });
    expect(invoke.mock.calls[1][1].body).toMatchObject({ captcha: "t0k" });
    expect(invoke.mock.calls[1][1].body).not.toHaveProperty("website");
  });

  it("tells an invalid or expired link apart from an outage", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(403, { error: "link_invalid" }) });
    expect(await fetchOptionsWithLink("tok")).toEqual({ kind: "invalid" });
    invoke.mockResolvedValue({ data: null, error: httpError(500, { error: "server_error" }) });
    expect(await fetchOptionsWithLink("tok")).toEqual({ kind: "error" });
    invoke.mockResolvedValue({ data: { options: "garbage" }, error: null });
    expect(await fetchOptionsWithLink("tok")).toEqual({ kind: "error" });
  });
});

describe("a member's options", () => {
  it("offers nothing before the migration reaches the project (function unknown)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await fetchWithdrawalOptions("o1")).toBeNull();
  });

  it("throws on any other database error so the screen says it, rather than hiding the right", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    await expect(fetchWithdrawalOptions("o1")).rejects.toThrow();
  });
});

describe("staff follow-up", () => {
  it.each([
    [null, { ok: true }],
    [{ code: "42501" }, { ok: false, reason: "forbidden" }],
    [{ code: "23514" }, { ok: false, reason: "settled" }],
    [{ code: "22023" }, { ok: false, reason: "invalid" }],
    [{ code: "XX000" }, { ok: false, reason: "unavailable" }],
  ])("database answer %j → %j", async (error, expected) => {
    rpc.mockResolvedValue({ data: null, error });
    expect(await markReturnReceived("w1")).toEqual(expected);
    expect(await refuseWithdrawal("w1", "other" as never, "note")).toEqual(expected);
  });

  it("sends a refusal's note trimmed, and no note when it is blank", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await refuseWithdrawal("w1", "other" as never, "  ");
    expect(rpc).toHaveBeenLastCalledWith("admin_refuse_withdrawal", { p_withdrawal_id: "w1", p_reason: "other", p_note: undefined });
    await refuseWithdrawal("w1", "other" as never, " damaged ");
    expect(rpc).toHaveBeenLastCalledWith("admin_refuse_withdrawal", { p_withdrawal_id: "w1", p_reason: "other", p_note: "damaged" });
  });
});
