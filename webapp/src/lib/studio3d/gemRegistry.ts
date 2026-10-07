import { estimateComposition, type CompositionEstimate, type StudioGem } from "./gemCatalog";
import type { PlacedJewelry } from "../../data/studioEditor";

/**
 * The Studio's gems as last loaded, for the code that runs outside React:
 * the 3D engine (what a library drag places) and the workspace repositories
 * (the estimate stored with a creation). `useStudioGems` keeps it current.
 * Empty until the catalogue has loaded: a placement then does nothing and an
 * estimate counts nothing, it never invents a gem.
 */

let gems: StudioGem[] = [];
let byKey = new Map<string, StudioGem>();

export function setStudioGems(list: StudioGem[]) {
  if (list === gems) return;
  gems = list;
  byKey = new Map(list.map((g) => [g.key, g]));
}

export function studioGem(key: string): StudioGem | undefined {
  return byKey.get(key);
}

export function studioGems(): StudioGem[] {
  return gems;
}

/** The indicative shop value of these pieces, at the prices last loaded. */
export function currentEstimate(pieces: Pick<PlacedJewelry, "productId" | "variantId" | "look">[]): CompositionEstimate {
  return estimateComposition(pieces, studioGem);
}
