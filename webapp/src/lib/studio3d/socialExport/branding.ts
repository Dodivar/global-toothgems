/**
 * What a social export may carry, by Studio plan (decision 101).
 *
 *   essential (and the trial)  the Global Toothgems watermark, always;
 *   artist                     their own logo, the Global Toothgems mark, or nothing;
 *   atelier                    the same, plus the layout templates.
 *
 * The tier is the database's answer (`studio_share_branding()`); the logo is
 * only uploadable and readable for an artist or atelier member (storage
 * policies). The watermark itself is drawn in the browser: these functions
 * keep the page honest (an essential member is never offered "none"), they are
 * not what protects it.
 *
 * Pure: no DOM, no Supabase.
 */

import { hasFeature, isStudioTier, type StudioTier } from "../../studioEntitlements";

export { isStudioTier, type StudioTier };

/** The mark in the corner of the export. */
export type ShareMark = "brand" | "logo" | "none";

export interface BrandingRights {
  /** The tier the rights come from; null without Studio access (treated as essential). */
  tier: StudioTier | null;
  /** May take the Global Toothgems watermark off. */
  mayRemoveWatermark: boolean;
  /** May put their own logo on. */
  mayUseLogo: boolean;
  /** May choose a layout template. */
  mayUseTemplates: boolean;
}

export interface ShareBranding {
  tier: StudioTier | null;
  /** The member's logo in `studio-share-logos`, returned only while the tier allows it. */
  logoPath: string | null;
  /** A logo is recorded, whether or not the tier allows it now. */
  hasLogo: boolean;
}

/** The function's JSON answer, or null when it is not one. */
export function parseShareBranding(raw: unknown): ShareBranding | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.tier !== null && row.tier !== undefined && !isStudioTier(row.tier)) return null;
  const tier = isStudioTier(row.tier) ? row.tier : null;
  const logoPath = typeof row.logo_path === "string" && row.logo_path ? row.logo_path : null;
  return { tier, logoPath: hasFeature(tier, "ownLogo") ? logoPath : null, hasLogo: row.has_logo === true || logoPath !== null };
}

export function rightsFor(tier: StudioTier | null): BrandingRights {
  // Decision 113: the same table as the plan pages (`STUDIO_PLAN_FEATURES`).
  const ownLogo = hasFeature(tier, "ownLogo");
  return { tier, mayRemoveWatermark: ownLogo, mayUseLogo: ownLogo, mayUseTemplates: hasFeature(tier, "postLayouts") };
}

/** The marks the dialog offers, in its order. Essential: the brand only. */
export function markChoices(rights: BrandingRights, hasLogo: boolean): ShareMark[] {
  if (!rights.mayRemoveWatermark) return ["brand"];
  return rights.mayUseLogo && hasLogo ? ["logo", "brand", "none"] : ["brand", "none"];
}

/**
 * The mark actually drawn: what was chosen when the rights allow it, else
 * the Global Toothgems watermark. A logo that is not loaded falls back too.
 */
export function resolveMark(rights: BrandingRights, chosen: ShareMark, logoReady: boolean): ShareMark {
  if (!rights.mayRemoveWatermark) return "brand";
  if (chosen === "logo") return rights.mayUseLogo && logoReady ? "logo" : "brand";
  return chosen;
}

/** The mark selected when the dialog opens: the member's logo when there is one. */
export function defaultMark(rights: BrandingRights, hasLogo: boolean): ShareMark {
  return markChoices(rights, hasLogo)[0];
}

/** Logo files accepted (the bucket's own limits, checked again by Storage). */
export const LOGO_LIMITS = {
  maxBytes: 2 * 1024 * 1024,
  types: ["image/png", "image/jpeg", "image/webp"] as readonly string[],
  /** The uploaded logo is redrawn as a PNG no larger than this on its long side. */
  maxSide: 1024,
};

export type LogoProblem = "type" | "size";

/** Why a chosen file cannot be a logo, or null when it can. */
export function logoFileProblem(file: { type: string; size: number }): LogoProblem | null {
  if (!LOGO_LIMITS.types.includes(file.type)) return "type";
  if (file.size > LOGO_LIMITS.maxBytes || file.size === 0) return "size";
  return null;
}

/** The size a logo is redrawn at: within `maxSide`, ratio kept, never enlarged. */
export function logoTargetSize(width: number, height: number, maxSide = LOGO_LIMITS.maxSide): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
