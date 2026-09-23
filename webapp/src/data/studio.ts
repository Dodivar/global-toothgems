import type { Localized } from "./types";
import type { GemShape } from "./products";

/**
 * Fictional content for the 3D Studio presentation and subscription pages.
 *
 * The Studio is a visual prototype: there is no editor, no renderer, no saved
 * composition and no subscription behind any of this. Everything the pages
 * show — the pieces in the library, the compositions on the canvas, the saved
 * creations — is fixture data, so the art direction can be reviewed before the
 * product exists.
 */

/**
 * Display price of the Studio subscription.
 *
 * A prototype value supplied with the brief (€5 per month). In production the
 * amount, currency and interval come from the Stripe Price the subscription is
 * created against, and access is granted by the verified webhook — never by
 * this constant or by the confirmation screen.
 */
export const STUDIO_PRICE = { amount: 5, currency: "EUR", interval: "month" } as const;

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

export interface LibraryPiece {
  id: string;
  shape: GemShape;
  material: StudioMaterial;
  name: Localized;
  /** Indicative real-world size shown in the properties panel. */
  spec: string;
}

export const STUDIO_LIBRARY: LibraryPiece[] = [
  { id: "crystal-round", shape: "round", material: "crystal", name: { fr: "Cristal rond", en: "Round crystal" }, spec: "SS5 · 1,8 mm" },
  { id: "sapphire-round", shape: "round", material: "sapphire", name: { fr: "Saphir rond", en: "Round sapphire" }, spec: "SS3 · 1,4 mm" },
  { id: "rose-round", shape: "round", material: "rose", name: { fr: "Rose fuchsia", en: "Fuchsia rose" }, spec: "SS5 · 1,8 mm" },
  { id: "gold-heart", shape: "heart", material: "gold", name: { fr: "Cœur or 18k", en: "18k gold heart" }, spec: "3,0 mm" },
  { id: "gold-star", shape: "star", material: "gold", name: { fr: "Étoile or 18k", en: "18k gold star" }, spec: "3,2 mm" },
  { id: "emerald-drop", shape: "drop", material: "emerald", name: { fr: "Goutte émeraude", en: "Emerald drop" }, spec: "2,4 mm" },
  { id: "opal-flower", shape: "flower", material: "opal", name: { fr: "Fleur opale", en: "Opal flower" }, spec: "3,0 mm" },
  { id: "crystal-navette", shape: "navette", material: "crystal", name: { fr: "Navette cristal", en: "Crystal navette" }, spec: "2,8 mm" },
  { id: "sapphire-baguette", shape: "baguette", material: "sapphire", name: { fr: "Baguette saphir", en: "Sapphire baguette" }, spec: "2,2 mm" },
];

export const MATERIALS: StudioMaterial[] = ["crystal", "sapphire", "rose", "emerald", "gold", "opal"];

/** Where a new piece lands when nothing is selected: the free spots, in order. */
export const FREE_SLOTS: Omit<PlacedPiece, "id" | "shape" | "material" | "size">[] = [
  { row: "upper", tooth: 4, u: 0.5, v: 0.62 },
  { row: "upper", tooth: 5, u: 0.5, v: 0.62 },
  { row: "upper", tooth: 3, u: 0.5, v: 0.55 },
  { row: "upper", tooth: 6, u: 0.5, v: 0.55 },
  { row: "upper", tooth: 2, u: 0.5, v: 0.5 },
  { row: "upper", tooth: 7, u: 0.5, v: 0.5 },
  { row: "lower", tooth: 3, u: 0.5, v: 0.45 },
  { row: "lower", tooth: 4, u: 0.5, v: 0.45 },
];

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

/** The three presets the Studio mockup offers in its composition panel. */
export const MOCKUP_PRESETS: CompositionId[] = ["signature", "minimal", "statement", "symmetrical"];

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

/** Fictional saved compositions for the "Save your creations" card. */
export const SAVED_CREATIONS: { id: CompositionId; name: string; edited: Localized }[] = [
  { id: "signature", name: "Aurora", edited: { fr: "Modifiée il y a 2 h", en: "Edited 2 h ago" } },
  { id: "symmetrical", name: "Émeraude miroir", edited: { fr: "Hier", en: "Yesterday" } },
  { id: "sparkle", name: "Stardust", edited: { fr: "Il y a 4 jours", en: "4 days ago" } },
];
