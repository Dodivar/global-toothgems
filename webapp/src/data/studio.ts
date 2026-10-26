import type { Localized } from "./types";
import type { GemShape } from "./products";

/**
 * Content of the 3D Studio presentation and subscription pages: the
 * compositions drawn on the inspiration boards (fixture art, not designs of
 * real members) and the plans. The working editor is a separate page
 * (`/studio-3d/atelier`, see `data/studioEditor.ts`); nothing here is read by it.
 */

export type StudioMaterial = "crystal" | "sapphire" | "rose" | "emerald" | "gold" | "opal";

/** A piece as it sits on the canvas. `u` and `v` are fractions of the tooth's box. */
export interface PlacedPiece {
  id: string;
  row: "upper" | "lower";
  /** Index in the row, left to right as the viewer sees it. */
  tooth: number;
  u: number;
  v: number;
  /** Rendered size in canvas units (the canvas is 640 wide). */
  size: number;
  shape: GemShape;
  material: StudioMaterial;
}

export type CompositionId = "signature" | "minimal" | "statement" | "symmetrical" | "mixed" | "sparkle" | "custom";

let seq = 0;
const p = (
  row: PlacedPiece["row"],
  tooth: number,
  u: number,
  v: number,
  size: number,
  shape: GemShape,
  material: StudioMaterial,
): PlacedPiece => ({ id: `p${++seq}`, row, tooth, u, v, size, shape, material });

export const COMPOSITIONS: Record<CompositionId, PlacedPiece[]> = {
  signature: [
    p("upper", 5, 0.5, 0.6, 22, "heart", "gold"),
    p("upper", 3, 0.52, 0.52, 13, "round", "crystal"),
    p("upper", 6, 0.48, 0.5, 11, "round", "sapphire"),
    p("upper", 6, 0.5, 0.74, 8, "round", "crystal"),
    p("upper", 2, 0.5, 0.48, 14, "star", "gold"),
  ],
  minimal: [p("upper", 3, 0.5, 0.55, 12, "round", "crystal")],
  statement: [
    p("upper", 4, 0.5, 0.58, 26, "star", "gold"),
    p("upper", 5, 0.5, 0.58, 26, "heart", "gold"),
    p("upper", 3, 0.5, 0.5, 14, "round", "rose"),
    p("upper", 6, 0.5, 0.5, 14, "round", "rose"),
    p("upper", 2, 0.5, 0.52, 11, "round", "crystal"),
    p("upper", 7, 0.5, 0.52, 11, "round", "crystal"),
  ],
  symmetrical: [
    p("upper", 3, 0.5, 0.55, 14, "drop", "emerald"),
    p("upper", 6, 0.5, 0.55, 14, "drop", "emerald"),
    p("upper", 2, 0.5, 0.52, 10, "round", "crystal"),
    p("upper", 7, 0.5, 0.52, 10, "round", "crystal"),
  ],
  mixed: [
    p("upper", 4, 0.5, 0.6, 18, "navette", "crystal"),
    p("upper", 6, 0.5, 0.5, 16, "flower", "opal"),
    p("upper", 2, 0.5, 0.52, 13, "star", "gold"),
    p("lower", 4, 0.5, 0.45, 11, "baguette", "sapphire"),
  ],
  sparkle: [
    p("upper", 3, 0.35, 0.45, 9, "round", "crystal"),
    p("upper", 3, 0.65, 0.62, 7, "round", "crystal"),
    p("upper", 4, 0.5, 0.55, 12, "round", "crystal"),
    p("upper", 5, 0.4, 0.7, 8, "round", "opal"),
    p("upper", 5, 0.62, 0.45, 10, "round", "crystal"),
    p("upper", 6, 0.5, 0.58, 9, "round", "sapphire"),
    p("upper", 7, 0.5, 0.5, 8, "round", "crystal"),
  ],
  custom: [
    p("upper", 5, 0.5, 0.6, 20, "flower", "gold"),
    p("upper", 5, 0.5, 0.6, 7, "round", "rose"),
    p("upper", 2, 0.5, 0.5, 12, "round", "emerald"),
    p("lower", 3, 0.5, 0.45, 10, "round", "crystal"),
  ],
};

/** Editorial inspiration boards. Names are the styles, notes are fictional. */
export interface InspirationBoard {
  id: CompositionId;
  title: Localized;
  note: Localized;
  pieces: Localized;
  tone: "blue" | "sand" | "ink" | "blush";
}

export const INSPIRATION: InspirationBoard[] = [
  {
    id: "minimal",
    title: { fr: "Minimal", en: "Minimal" },
    note: { fr: "Un seul éclat, posé là où le sourire accroche la lumière.", en: "A single glint, placed where the smile catches the light." },
    pieces: { fr: "1 pièce · cristal SS5", en: "1 piece · SS5 crystal" },
    tone: "sand",
  },
  {
    id: "statement",
    title: { fr: "Statement", en: "Statement" },
    note: { fr: "Or 18k au centre, rose en écho — une composition qui se remarque.", en: "18k gold at the centre, rose as an echo — a look that gets noticed." },
    pieces: { fr: "6 pièces · or, rose, cristal", en: "6 pieces · gold, rose, crystal" },
    tone: "ink",
  },
  {
    id: "symmetrical",
    title: { fr: "Symétrique", en: "Symmetrical" },
    note: { fr: "Deux gouttes émeraude en miroir, un équilibre presque architectural.", en: "Two mirrored emerald drops, an almost architectural balance." },
    pieces: { fr: "4 pièces · émeraude, cristal", en: "4 pieces · emerald, crystal" },
    tone: "blue",
  },
  {
    id: "mixed",
    title: { fr: "Formes mixtes", en: "Mixed shapes" },
    note: { fr: "Navette, fleur, étoile, baguette : chaque dent raconte autre chose.", en: "Navette, flower, star, baguette: every tooth tells its own story." },
    pieces: { fr: "4 pièces · 4 formes", en: "4 pieces · 4 shapes" },
    tone: "sand",
  },
  {
    id: "sparkle",
    title: { fr: "Sparkle", en: "Sparkle" },
    note: { fr: "Une constellation de micro-cristaux, dispersée comme une poussière d’étoiles.", en: "A constellation of micro crystals, scattered like stardust." },
    pieces: { fr: "7 pièces · cristal, opale", en: "7 pieces · crystal, opal" },
    tone: "blush",
  },
  {
    id: "custom",
    title: { fr: "Composition libre", en: "Custom composition" },
    note: { fr: "Une fleur or sertie d’un cœur rose : la vôtre ne ressemblera qu’à vous.", en: "A gold flower set with a rose heart: yours will only look like you." },
    pieces: { fr: "4 pièces · or, rose, émeraude", en: "4 pieces · gold, rose, emerald" },
    tone: "blue",
  },
];

/**
 * The Studio's offers: a free trial, then three plans billed monthly or yearly
 * (yearly = 10 months, "two months free"). Amounts in integer minor units,
 * VAT included (§8) — confirmed by the owner on 2026-10-18.
 *
 * These are the values the pages show until the live prices are read from
 * `studio_plan_prices` (`lib/studioBilling.ts`, `useStudioPlanPrices`), and the
 * values the test-mode Stripe Prices were created with. What a member is
 * charged is always the Stripe Price the subscription is created against, and
 * access always comes from the verified webhook (`studio_subscriptions`,
 * decision 94) — never from here. What each plan includes is
 * `STUDIO_PLAN_FEATURES` below (decision 113).
 */
export type StudioPlanId = "trial" | "essential" | "artist" | "atelier";
export type StudioPaidPlanId = Exclude<StudioPlanId, "trial">;
export type StudioBillingInterval = "month" | "year";

export interface StudioPlan {
  id: StudioPlanId;
  /** Monthly price in minor units; 0 for the trial. */
  amountMinor: number;
  /** Yearly price in minor units (paid plans only). */
  yearlyAmountMinor?: number;
  currency: "EUR";
  /** Length of the free trial, for the trial only. */
  trialDays?: number;
  /** The plan the page singles out. */
  featured?: boolean;
}

export const STUDIO_PLANS: StudioPlan[] = [
  { id: "trial", amountMinor: 0, currency: "EUR", trialDays: 2 },
  { id: "essential", amountMinor: 500, yearlyAmountMinor: 5000, currency: "EUR" },
  { id: "artist", amountMinor: 1990, yearlyAmountMinor: 19900, currency: "EUR", featured: true },
  { id: "atelier", amountMinor: 3990, yearlyAmountMinor: 39900, currency: "EUR" },
];

/** The lowest paid plan, quoted as "from …" on the page. */
export const STUDIO_ENTRY_PLAN = STUDIO_PLANS.find((plan) => plan.id === "essential")!;
export const STUDIO_TRIAL_DAYS = STUDIO_PLANS.find((plan) => plan.id === "trial")!.trialDays!;

/**
 * What each paid plan includes (decision 113, owner's request 2026-10-26):
 * Essential is limited in features and in what it saves, Artist saves more and
 * signs its posts, Atelier has (almost) everything unlimited plus the Glowbook
 * and the AI smile try-on for its clients.
 *
 * Display copy of what the database enforces — keep both in step:
 *   * the numbers: `private.studio_plan_limit()` (migration
 *     `20261026170231_studio_plan_entitlements`), a save over them is refused;
 *   * the Glowbook: `private.glowbook_allowed()` (same migration);
 *   * templates and collections: `private.studio_artist_plan()` (decision 113 (b),
 *     migration `20261026190000_studio_templates_collections_artist`);
 *   * the smile try-on: `private.studio_try_on_allowed()` (decision 111 (a));
 *   * the post signature and layouts: `private.studio_user_tier()` (decision 101).
 * A trial counts as Essential, active staff as Atelier. `null` = unlimited.
 */
export interface StudioPlanFeatures {
  creations: number | null;
  gemGroups: number | null;
  /** How social posts are signed: the Global Toothgems watermark, or the member's own logo (or nothing). */
  postSignature: "watermark" | "ownLogo";
  postLayouts: boolean;
  /** The Global Toothgems templates page (browse and copy). */
  templates: boolean;
  /** Collections ("folders"): creating, renaming and filing creations. */
  collections: boolean;
  glowbook: boolean;
  tryOn: boolean;
}

export const STUDIO_PLAN_FEATURES: Record<StudioPaidPlanId, StudioPlanFeatures> = {
  essential: {
    creations: 15,
    gemGroups: 3,
    postSignature: "watermark",
    postLayouts: false,
    templates: false,
    collections: false,
    glowbook: false,
    tryOn: false,
  },
  artist: {
    creations: 150,
    gemGroups: 30,
    postSignature: "ownLogo",
    postLayouts: false,
    templates: true,
    collections: true,
    glowbook: false,
    tryOn: false,
  },
  atelier: {
    creations: null,
    gemGroups: null,
    postSignature: "ownLogo",
    postLayouts: true,
    templates: true,
    collections: true,
    glowbook: true,
    tryOn: true,
  },
};
