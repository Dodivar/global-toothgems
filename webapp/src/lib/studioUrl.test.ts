import { describe, expect, it } from "vitest";
import { creationDetailPath, creationFromQuery, GLOWBOOK_SPACE_PATH, legacyGlowbookAddress, parseStudioCheckoutQuery, studioCheckoutPath, studioPlansPathFor, studioSectionFromPath } from "./studioUrl";

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
    expect(studioPlansPathFor("studio_atelier_page")).toBe("/studio-3d/formule-atelier");
    expect(parseStudioCheckoutQuery(new URLSearchParams("plan=atelier&interval=year&from=studio_atelier_page"))?.surface).toBe("studio_atelier_page");
  });
});

describe("My Glowbook in the member space (artist space, 2026-11-17)", () => {
  it("moves the Studio's former Glowbook section, its tab kept", () => {
    expect(legacyGlowbookAddress("/studio-3d/atelier/glowbook", "")).toBe(GLOWBOOK_SPACE_PATH);
    expect(legacyGlowbookAddress("/studio-3d/atelier/glowbook/", "?tab=look")).toBe("/compte/glowbook?tab=look");
    expect(legacyGlowbookAddress("/studio-3d/atelier", "")).toBeNull();
    expect(legacyGlowbookAddress("/studio-3d/atelier/mes-creations", "")).toBeNull();
  });

  it("is no longer a Studio section", () => {
    expect(studioSectionFromPath("/studio-3d/atelier/glowbook")).toBeNull();
    expect(studioSectionFromPath("/studio-3d/atelier/mes-creations")).toBe("creations");
  });

  it("opens a creation's detail in My Creations, from a safe id only", () => {
    const path = creationDetailPath("0f8e0c2a-1b2c-4d5e-8f90-123456789abc");
    expect(path).toBe("/studio-3d/atelier/mes-creations?creation=0f8e0c2a-1b2c-4d5e-8f90-123456789abc");
    expect(creationFromQuery(path.split("?")[1])).toBe("0f8e0c2a-1b2c-4d5e-8f90-123456789abc");
    expect(creationFromQuery("creation=%3Cscript%3E")).toBeNull();
    expect(creationFromQuery("")).toBeNull();
  });
});
