import { describe, expect, it } from "vitest";
import { CONSENT_MAX_AGE_MS, parseConsentRecord } from "./cookieConsent";

const NOW = Date.parse("2026-11-08T12:00:00Z");

describe("parseConsentRecord", () => {
  it("reads a recent choice", () => {
    const raw = JSON.stringify({ analytics: true, decidedAt: "2026-11-01T00:00:00Z" });
    expect(parseConsentRecord(raw, NOW)).toEqual({ analytics: true, decidedAt: "2026-11-01T00:00:00Z" });
  });

  it("keeps only the analytics value of a record written with the former categories", () => {
    const raw = JSON.stringify({ preferences: true, analytics: false, marketing: true, decidedAt: "2026-10-01T00:00:00Z" });
    expect(parseConsentRecord(raw, NOW)).toEqual({ analytics: false, decidedAt: "2026-10-01T00:00:00Z" });
  });

  it("treats anything but true as refused", () => {
    const raw = JSON.stringify({ analytics: "yes", decidedAt: "2026-11-01T00:00:00Z" });
    expect(parseConsentRecord(raw, NOW)?.analytics).toBe(false);
  });

  it("asks again once the choice is older than 6 months", () => {
    const fresh = new Date(NOW - CONSENT_MAX_AGE_MS).toISOString();
    const stale = new Date(NOW - CONSENT_MAX_AGE_MS - 1000).toISOString();
    expect(parseConsentRecord(JSON.stringify({ analytics: true, decidedAt: fresh }), NOW)).not.toBeNull();
    expect(parseConsentRecord(JSON.stringify({ analytics: true, decidedAt: stale }), NOW)).toBeNull();
  });

  it("ignores missing or malformed records", () => {
    expect(parseConsentRecord(null, NOW)).toBeNull();
    expect(parseConsentRecord("not json", NOW)).toBeNull();
    expect(parseConsentRecord("null", NOW)).toBeNull();
    expect(parseConsentRecord(JSON.stringify({ analytics: true }), NOW)).toBeNull();
    expect(parseConsentRecord(JSON.stringify({ analytics: true, decidedAt: "never" }), NOW)).toBeNull();
  });
});
