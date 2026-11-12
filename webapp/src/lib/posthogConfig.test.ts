import { describe, expect, it } from "vitest";
import { posthogCloudHosts, replayAllowed } from "./posthogConfig";

describe("posthogCloudHosts", () => {
  it("maps PostHog Cloud EU and US to their ingestion, assets and app hosts", () => {
    expect(posthogCloudHosts("https://eu.i.posthog.com")).toEqual({
      ingest: "https://eu.i.posthog.com",
      assets: "https://eu-assets.i.posthog.com",
      ui: "https://eu.posthog.com",
    });
    expect(posthogCloudHosts("https://us.i.posthog.com/")?.assets).toBe("https://us-assets.i.posthog.com");
  });

  it("does not proxy another host, a plain-HTTP one or a malformed value", () => {
    expect(posthogCloudHosts(undefined)).toBeNull();
    expect(posthogCloudHosts("")).toBeNull();
    expect(posthogCloudHosts("https://analytics.example.com")).toBeNull();
    expect(posthogCloudHosts("http://eu.i.posthog.com")).toBeNull();
    expect(posthogCloudHosts("https://eu.i.posthog.com.evil.test")).toBeNull();
    expect(posthogCloudHosts("not a url")).toBeNull();
  });
});

describe("replayAllowed", () => {
  it("records the storefront, the Studio and the learner pages", () => {
    for (const path of ["/fr", "/en", "/fr/boutique/gemme", "/en/cart", "/fr/panier/confirmation", "/studio-3d", "/studio-3d/atelier", "/studio-3d/paiement", "/academy/cours/x"]) {
      expect(replayAllowed(path), path).toBe(true);
    }
  });

  it("never records the member space, the back office, sign-in, recovery or the guest withdrawal", () => {
    for (const path of [
      "/",
      "/compte",
      "/compte/commandes/GT-1",
      "/admin",
      "/admin/clients",
      "/connexion",
      "/inscription",
      "/mot-de-passe-oublie",
      "/reinitialiser-mot-de-passe",
      "/auth/confirm",
      "/newsletter/confirmer",
      "/fr/retours-remboursements/retractation",
      "/en/returns/withdrawal",
      "/en/returns/withdrawal?x=1",
      "/france",
      "/english",
    ]) {
      expect(replayAllowed(path), path).toBe(false);
    }
  });

  it("still records the returns policy page itself", () => {
    expect(replayAllowed("/fr/retours-remboursements")).toBe(true);
  });
});
