import { STUDIO_PLAN_FEATURES, type StudioPaidPlanId, type StudioPlanFeatures } from "../data/studio";

/**
 * Which Studio plan opens what (decision 113) — the browser's one reading of
 * `STUDIO_PLAN_FEATURES`, for every screen that shows, hides or locks a
 * feature by plan. Pure. Navigation and display only: the database decides
 * from the same tier (`private.studio_user_tier()`) and refuses the rest.
 *
 * The tier is the database's answer: a trial counts as `essential`, active
 * staff as `atelier`, and no tier (null) means no Studio access at all.
 */

export type StudioTier = StudioPaidPlanId;

/** The features a plan either has or has not. */
export type StudioFeature = "ownLogo" | "postLayouts" | "transparentExport" | "templates" | "collections" | "glowbook" | "tryOn";

/** The features that show the "comes with the … plan" panel when the plan lacks them (`PlanLocked`). */
export type LockedFeature = Extract<StudioFeature, "glowbook" | "templates" | "collections" | "transparentExport" | "tryOn">;

export type StudioCountKind = "creations" | "gemGroups";

const TIERS: readonly StudioTier[] = ["essential", "artist", "atelier"];

export function isStudioTier(value: unknown): value is StudioTier {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value);
}

/** What a tier includes; null without Studio access. */
export function planFeatures(tier: StudioTier | null): StudioPlanFeatures | null {
  return tier ? STUDIO_PLAN_FEATURES[tier] : null;
}

/** Does this tier open the feature? Never without a tier. */
export function hasFeature(tier: StudioTier | null, feature: StudioFeature): boolean {
  const plan = planFeatures(tier);
  if (!plan) return false;
  return feature === "ownLogo" ? plan.postSignature === "ownLogo" : plan[feature];
}

/** How many creations / Gem Groups the tier keeps: null = unlimited, 0 without a tier. */
export function countLimit(tier: StudioTier | null, kind: StudioCountKind): number | null {
  const plan = planFeatures(tier);
  return plan ? plan[kind] : 0;
}

/** May one more be saved, holding `used` already? */
export function canSaveMore(tier: StudioTier | null, kind: StudioCountKind, used: number): boolean {
  const limit = countLimit(tier, kind);
  return limit === null || used < limit;
}

/** The lowest paid plan that opens the feature (for "comes with the … plan"), null if none does. */
export function lowestPlanWith(feature: StudioFeature): StudioTier | null {
  return TIERS.find((tier) => hasFeature(tier, feature)) ?? null;
}
