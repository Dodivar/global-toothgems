/**
 * Content of the 3D Studio presentation and subscription pages: the plans.
 * The working editor is a separate page (`/studio-3d/atelier`, see
 * `data/studioEditor.ts`); nothing here is read by it.
 */

export type StudioMaterial = "crystal" | "sapphire" | "rose" | "emerald" | "gold" | "opal";

/**
 * The Studio's offers: a free trial, then three plans billed monthly or yearly
 * (yearly = 10 months, "two months free"). Amounts in integer minor units,
 * VAT included (§8) — confirmed by the owner on 2026-10-18; Essential 4,90 € since
 * decision 153 (2026-11-16).
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
  { id: "essential", amountMinor: 490, yearlyAmountMinor: 4900, currency: "EUR" },
  { id: "artist", amountMinor: 1990, yearlyAmountMinor: 19900, currency: "EUR", featured: true },
  { id: "atelier", amountMinor: 3990, yearlyAmountMinor: 39900, currency: "EUR" },
];

/** The lowest paid plan, quoted as "from …" on the page. */
export const STUDIO_ENTRY_PLAN = STUDIO_PLANS.find((plan) => plan.id === "essential")!;
export const STUDIO_TRIAL_DAYS = STUDIO_PLANS.find((plan) => plan.id === "trial")!.trialDays!;

/**
 * What each paid plan includes (decision 113, owner's request 2026-10-26):
 * Essential is limited in features and in what it saves, Artist saves more,
 * signs its posts and shows its work on a Glowbook (decision 153), Atelier has
 * (almost) everything unlimited plus online bookings, the calendar, the artist
 * directory and the AI smile try-on for its clients.
 *
 * Display copy of what the database enforces — keep both in step:
 *   * the numbers: `private.studio_plan_limit()` (migration
 *     `20261026170231_studio_plan_entitlements`), a save over them is refused;
 *   * the Glowbook: `private.glowbook_allowed()` (same migration; Artist and up
 *     since decision 153, migration `20261116224903_studio_artist_plan_glowbook`);
 *   * online bookings, the calendar and the artist directory:
 *     `private.glowbook_booking_allowed()` (decision 153: Atelier only);
 *   * collections: `private.studio_artist_plan()` (decision 113 (b), migration
 *     `20261026190000_studio_templates_collections_artist`); templates: any Studio
 *     tier since decision 133 (owner's request 2026-11-11);
 *   * the smile try-on: `private.studio_try_on_allowed()` (decision 111 (a));
 *   * the post signature and layouts: `private.studio_user_tier()` (decision 101);
 *   * share links: `private.studio_share_links_allowed()` (decision 133, migration
 *     `20261111093241_studio_essential_plan_tools`); posts, the front view and the
 *     placement sheet are drawn in the browser from the member's own data, so
 *     only the screens hold them back.
 * A trial counts as Essential, active staff as Atelier. `null` = unlimited.
 */
export interface StudioPlanFeatures {
  creations: number | null;
  gemGroups: number | null;
  /** How social posts are signed: the Global Toothgems watermark, or the member's own logo (or nothing). */
  postSignature: "watermark" | "ownLogo";
  postLayouts: boolean;
  /** "Create a post" for the social networks: HD still or 360° video (decision 133: Artist and up). */
  posts: boolean;
  /** The appointment tools: front view, printable placement sheet and read-only share links (decision 133: Artist and up). */
  clientTools: boolean;
  /** PNG export with a transparent background (owner's request 2026-10-28); below it the image keeps the stage and the watermark. */
  transparentExport: boolean;
  /** The Global Toothgems templates page (browse and copy). */
  templates: boolean;
  /** Collections ("folders"): creating, renaming and filing creations. */
  collections: boolean;
  /** The public Glowbook page (decision 153: Artist and up). */
  glowbook: boolean;
  /** Online bookings, the artist's calendar and the "Find an artist" directory (decision 153: Atelier only). */
  bookings: boolean;
  tryOn: boolean;
}

export const STUDIO_PLAN_FEATURES: Record<StudioPaidPlanId, StudioPlanFeatures> = {
  essential: {
    creations: 10,
    gemGroups: 3,
    postSignature: "watermark",
    postLayouts: false,
    posts: false,
    clientTools: false,
    transparentExport: false,
    templates: true,
    collections: false,
    glowbook: false,
    bookings: false,
    tryOn: false,
  },
  artist: {
    creations: 50,
    gemGroups: 15,
    postSignature: "ownLogo",
    postLayouts: false,
    posts: true,
    clientTools: true,
    transparentExport: true,
    templates: true,
    collections: true,
    glowbook: true,
    bookings: false,
    tryOn: false,
  },
  atelier: {
    creations: null,
    gemGroups: null,
    postSignature: "ownLogo",
    postLayouts: true,
    posts: true,
    clientTools: true,
    transparentExport: true,
    templates: true,
    collections: true,
    glowbook: true,
    bookings: true,
    tryOn: true,
  },
};
