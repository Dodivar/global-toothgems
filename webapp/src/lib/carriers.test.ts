import { describe, expect, it } from "vitest";
import { CARRIERS, isTrackingUrl, suggestedTrackingUrl } from "./carriers";

describe("suggestedTrackingUrl", () => {
  it("builds the carrier's page from the tracking number, whatever the case of the carrier", () => {
    expect(suggestedTrackingUrl("colissimo", "6A12345678901")).toBe(
      "https://www.laposte.fr/outils/suivre-vos-envois?code=6A12345678901",
    );
    expect(suggestedTrackingUrl(" UPS ", "1Z 999")).toBe("https://www.ups.com/track?tracknum=1Z%20999");
  });

  it("suggests nothing for an unknown carrier or a number too short for the database", () => {
    expect(suggestedTrackingUrl("Pigeon voyageur", "ABC123")).toBe("");
    expect(suggestedTrackingUrl("Colissimo", "A1")).toBe("");
    expect(suggestedTrackingUrl("Colissimo", "")).toBe("");
  });

  it("only ever proposes https addresses, each with its number placeholder", () => {
    for (const carrier of CARRIERS) {
      expect(carrier.trackingUrl.startsWith("https://")).toBe(true);
      expect(carrier.trackingUrl).toContain("{number}");
      expect(isTrackingUrl(suggestedTrackingUrl(carrier.name, "ABC123456"))).toBe(true);
    }
  });
});

describe("isTrackingUrl", () => {
  it("accepts nothing or an https address, as the database does", () => {
    expect(isTrackingUrl("")).toBe(true);
    expect(isTrackingUrl("  ")).toBe(true);
    expect(isTrackingUrl("https://track.example.com/x?y=1")).toBe(true);
    expect(isTrackingUrl("http://track.example.com")).toBe(false);
    expect(isTrackingUrl("javascript:alert(1)")).toBe(false);
    expect(isTrackingUrl("not a url")).toBe(false);
  });
});
