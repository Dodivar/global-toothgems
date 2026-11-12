import { describe, expect, it } from "vitest";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { functionErrorCode, oneOf, readFunctionFailure } from "./functionError";

const httpError = (body: string, status: number) => new FunctionsHttpError(new Response(body, { status }));

describe("readFunctionFailure", () => {
  it("reads the status and JSON body of an HTTP answer", async () => {
    expect(await readFunctionFailure(httpError('{"error":"rate_limited"}', 429))).toEqual({ kind: "http", status: 429, body: { error: "rate_limited" } });
  });
  it("leaves the body undefined when it is not JSON", async () => {
    expect(await readFunctionFailure(httpError("<html>", 502))).toEqual({ kind: "http", status: 502, body: undefined });
  });
  it("treats anything else as no answer", async () => {
    expect(await readFunctionFailure(new FunctionsFetchError("down"))).toEqual({ kind: "network" });
    expect(await readFunctionFailure(new Error("x"))).toEqual({ kind: "network" });
  });
});

describe("functionErrorCode / oneOf", () => {
  it("reads the error field only from objects", () => {
    expect(functionErrorCode({ error: "x" })).toBe("x");
    expect(functionErrorCode(null)).toBeUndefined();
    expect(functionErrorCode("x")).toBeUndefined();
  });
  it("keeps known codes and replaces the others", () => {
    const codes = ["a", "b"] as const;
    expect(oneOf(codes, "b", "a")).toBe("b");
    expect(oneOf(codes, "zzz", "a")).toBe("a");
    expect(oneOf(codes, undefined, "a")).toBe("a");
  });
});
