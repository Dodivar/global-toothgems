import { describe, expect, it } from "vitest";
import { parseStudioCheckoutQuery, studioCheckoutPath, studioPlansPathFor } from "./studioUrl";

describe("Studio checkout address", () => {
  it("round-trips a plan, an interval and the surface it was chosen on", () => {
    const path = studioCheckoutPath({ plan: "artist", interval: "year", surface: "studio_locked" });
    expect(path).toBe("/studio-3d/paiement?plan=artist&interval=year&from=studio_locked");
    expect(parseStudioCheckoutQuery(new URL(path, "https://site.invalid").searchParams)).toEqual({
      plan: "artist",
      interval: "year",
      surface: "studio_locked",
    });
  });

  it("refuses a plan or an interval not on sale; an unknown origin is the subscription page", () => {
    expect(parseStudioCheckoutQuery(new URLSearchParams("plan=trial&interval=month"))).toBeNull();
    expect(parseStudioCheckoutQuery(new URLSearchParams("plan=artist&interval=week"))).toBeNull();
    expect(parseStudioCheckoutQuery(new URLSearchParams("interval=month"))).toBeNull();
    expect(parseStudioCheckoutQuery(new URLSearchParams("plan=essential&interval=month&from=elsewhere"))?.surface).toBe("studio_subscribe_page");
  });

  it("leads back to the plans the member chose from", () => {
    expect(studioPlansPathFor("studio_locked")).toBe("/studio-3d/atelier");
    expect(studioPlansPathFor("studio_page")).toBe("/studio-3d");
    expect(studioPlansPathFor("studio_subscribe_page")).toBe("/studio-3d/abonnement");
  });
});
