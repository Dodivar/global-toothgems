import { describe, expect, it } from "vitest";
import { STUDIO_PLAN_FEATURES, STUDIO_PLANS, type StudioPaidPlanId } from "../data/studio";
import { canSaveMore, countLimit, hasFeature, isStudioTier, lowestPlanWith, planFeatures, type StudioFeature } from "./studioEntitlements";
import { atLimit, parseAccessRow } from "./studioAccessState";
import { rightsFor } from "./studio3d/socialExport/branding";

const TIERS: StudioPaidPlanId[] = ["essential", "artist", "atelier"];
const FEATURES: StudioFeature[] = ["ownLogo", "postLayouts", "templates", "collections", "glowbook", "tryOn"];

/**
 * Who gets what (decision 113). The expected table is written out here, on
 * purpose, rather than read from `STUDIO_PLAN_FEATURES`: changing what a plan
 * includes must be a deliberate edit of this test too (and of the database,
 * `private.studio_plan_limit()`, `glowbook_allowed()`, `studio_artist_plan()`,
 * `studio_try_on_allowed()`, `studio_user_tier()`).
 */
const EXPECTED: Record<StudioPaidPlanId, Record<StudioFeature, boolean>> = {
  essential: { ownLogo: false, postLayouts: false, templates: false, collections: false, glowbook: false, tryOn: false },
  artist: { ownLogo: true, postLayouts: false, templates: true, collections: true, glowbook: false, tryOn: false },
  atelier: { ownLogo: true, postLayouts: true, templates: true, collections: true, glowbook: true, tryOn: true },
};

describe("hasFeature", () => {
  it.each(TIERS)("opens exactly the %s plan's features", (tier) => {
    for (const feature of FEATURES) expect(hasFeature(tier, feature), `${tier} × ${feature}`).toBe(EXPECTED[tier][feature]);
  });

  it("opens nothing without a tier (no Studio access, trial over, unknown answer)", () => {
    for (const feature of FEATURES) expect(hasFeature(null, feature)).toBe(false);
    expect(planFeatures(null)).toBeNull();
  });

  it("keeps the templates page and the folders from the Artist plan up only", () => {
    expect(hasFeature("essential", "templates")).toBe(false);
    expect(hasFeature("essential", "collections")).toBe(false);
    expect(lowestPlanWith("templates")).toBe("artist");
    expect(lowestPlanWith("collections")).toBe("artist");
  });

  it("keeps the Glowbook, the AI try-on and the post layouts for Atelier", () => {
    expect(lowestPlanWith("glowbook")).toBe("atelier");
    expect(lowestPlanWith("tryOn")).toBe("atelier");
    expect(lowestPlanWith("postLayouts")).toBe("atelier");
    expect(lowestPlanWith("ownLogo")).toBe("artist");
  });

  it("never takes from a higher plan what a lower one has", () => {
    for (let i = 1; i < TIERS.length; i++) {
      for (const feature of FEATURES) {
        if (hasFeature(TIERS[i - 1], feature)) expect(hasFeature(TIERS[i], feature), `${TIERS[i]} × ${feature}`).toBe(true);
      }
      for (const kind of ["creations", "gemGroups"] as const) {
        const lower = countLimit(TIERS[i - 1], kind);
        const higher = countLimit(TIERS[i], kind);
        expect(higher === null || (lower !== null && higher > lower), `${TIERS[i]} ${kind}`).toBe(true);
      }
    }
  });

  it("covers every paid plan the pages sell, and only those", () => {
    const sold = STUDIO_PLANS.filter((plan) => plan.id !== "trial").map((plan) => plan.id);
    expect(sold).toEqual(TIERS);
    expect(Object.keys(STUDIO_PLAN_FEATURES).sort()).toEqual([...TIERS].sort());
  });
});

describe("saved creations and Gem Groups", () => {
  it("mirrors the database's numbers (private.studio_plan_limit)", () => {
    expect(countLimit("essential", "creations")).toBe(15);
    expect(countLimit("essential", "gemGroups")).toBe(3);
    expect(countLimit("artist", "creations")).toBe(150);
    expect(countLimit("artist", "gemGroups")).toBe(30);
    expect(countLimit("atelier", "creations")).toBeNull();
    expect(countLimit("atelier", "gemGroups")).toBeNull();
  });

  it("refuses the save past the limit, at the exact boundary", () => {
    expect(canSaveMore("essential", "creations", 14)).toBe(true);
    expect(canSaveMore("essential", "creations", 15)).toBe(false);
    expect(canSaveMore("essential", "gemGroups", 2)).toBe(true);
    expect(canSaveMore("essential", "gemGroups", 3)).toBe(false);
    expect(canSaveMore("artist", "creations", 149)).toBe(true);
    expect(canSaveMore("artist", "creations", 150)).toBe(false);
    expect(canSaveMore("artist", "gemGroups", 30)).toBe(false);
  });

  it("never limits Atelier, and lets nothing be saved without a tier", () => {
    expect(canSaveMore("atelier", "creations", 100_000)).toBe(true);
    expect(canSaveMore("atelier", "gemGroups", 100_000)).toBe(true);
    expect(countLimit(null, "creations")).toBe(0);
    expect(canSaveMore(null, "creations", 0)).toBe(false);
  });

  it("keeps everything after a downgrade but saves nothing over the new limit", () => {
    // An Artist member holding 40 creations moves to Essential.
    expect(canSaveMore("artist", "creations", 40)).toBe(true);
    expect(canSaveMore("essential", "creations", 40)).toBe(false);
  });
});

describe("the database's answer drives the rights", () => {
  const base = { server_now: "2026-10-26T10:00:00.000Z", subscription_plan: null, subscription_status: null };

  it("a trial member gets the Essential plan's rights only", () => {
    const info = parseAccessRow({
      ...base,
      state: "trial_active",
      trial_started_at: "2026-10-26T09:00:00.000Z",
      trial_expires_at: "2026-10-28T09:00:00.000Z",
      tier: "essential",
      glowbook: false,
      limits: { creations: 15, gem_groups: 3 },
      usage: { creations: 15, gem_groups: 0 },
    })!;
    for (const feature of FEATURES) expect(hasFeature(info.tier, feature)).toBe(false);
    expect(atLimit(info, "creations")).toBe(true);
    expect(atLimit(info, "gemGroups")).toBe(false);
  });

  it("active staff get the Atelier plan's rights", () => {
    const info = parseAccessRow({ ...base, state: "staff", tier: "atelier", glowbook: true, limits: { creations: null, gem_groups: null } })!;
    for (const feature of FEATURES) expect(hasFeature(info.tier, feature)).toBe(true);
    expect(info.glowbook).toBe(true);
    expect(atLimit(info, "creations")).toBe(false);
  });

  it("an ended access or an unknown tier opens nothing", () => {
    const ended = parseAccessRow({ ...base, state: "trial_expired", tier: null, glowbook: false })!;
    const forged = parseAccessRow({ ...base, state: "subscribed", tier: "platinum", glowbook: true })!;
    for (const feature of FEATURES) {
      expect(hasFeature(ended.tier, feature)).toBe(false);
      expect(hasFeature(forged.tier, feature)).toBe(false);
    }
    expect(isStudioTier("platinum")).toBe(false);
    expect(isStudioTier("ATELIER")).toBe(false);
  });
});

describe("social export rights follow the same table", () => {
  it.each([...TIERS, null] as const)("%s", (tier) => {
    const rights = rightsFor(tier);
    expect(rights.mayUseLogo).toBe(hasFeature(tier, "ownLogo"));
    expect(rights.mayRemoveWatermark).toBe(hasFeature(tier, "ownLogo"));
    expect(rights.mayUseTemplates).toBe(hasFeature(tier, "postLayouts"));
  });
});
