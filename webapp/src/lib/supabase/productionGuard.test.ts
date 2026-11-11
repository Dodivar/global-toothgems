import { describe, expect, it } from "vitest";
import { assertProductionConfig, productionConfigProblems } from "./productionGuard";

const jwt = (payload: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.sig`;

const GOOD = {
  VERCEL_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefgh.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc123",
};

describe("production build guard", () => {
  it("lets a configured production build through", () => {
    expect(productionConfigProblems(GOOD)).toEqual([]);
    expect(() => assertProductionConfig(GOOD)).not.toThrow();
    expect(productionConfigProblems({ ...GOOD, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "anon" }) })).toEqual([]);
  });

  it("never stops a non-production build: CI mock mode, previews, local", () => {
    expect(productionConfigProblems({ NODE_ENV: "production" })).toEqual([]);
    expect(productionConfigProblems({ VERCEL_ENV: "preview" })).toEqual([]);
    expect(productionConfigProblems({ VERCEL_ENV: "development" })).toEqual([]);
    expect(productionConfigProblems({})).toEqual([]);
  });

  it("stops a production build that would fall back to the mock data", () => {
    expect(() => assertProductionConfig({ VERCEL_ENV: "production" })).toThrow(/NEXT_PUBLIC_SUPABASE_URL is not set.*PUBLISHABLE_KEY is not set/);
    expect(productionConfigProblems({ ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "  " })).toHaveLength(1);
    expect(productionConfigProblems({ ...GOOD, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" })).toHaveLength(1);
  });

  it("stops a production build pointed at a local stack, plain http or a malformed address", () => {
    expect(productionConfigProblems({ ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }).join()).toMatch(/https.*local/);
    expect(productionConfigProblems({ ...GOOD, NEXT_PUBLIC_SUPABASE_URL: "not a url" }).join()).toMatch(/not a valid/);
  });

  it("stops a production build that would put a secret key in the browser bundle", () => {
    expect(productionConfigProblems({ ...GOOD, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_xyz" }).join()).toMatch(/secret/);
    expect(productionConfigProblems({ ...GOOD, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "service_role" }) }).join()).toMatch(/service-role/);
  });
});
