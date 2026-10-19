import { useCallback } from "react";
import { FREE_TOOTH, isStudioShape, type PlacedJewelry } from "../../data/studioEditor";
import type { FrontViewGem } from "../../lib/studio3d/frontView";
import { useEditorLabels } from "./editor/editorLabels";

/** One gem in words, in the UI language: what the list beside the front view and the placement sheet say. */
export interface GemDescription {
  /** "11 · Central incisor · upper right" — the FDI number the Studio shows, then the tooth's name. */
  tooth: string;
  shape: string;
  /** "SS5 · ≈ 1.8 mm". */
  size: string;
  /** The colour variant's name and the material: "White gold · Metal", "Crystal · Iridescent". */
  colour: string;
  /** "back face" / "not drawn", when it applies. */
  note: string | null;
}

/**
 * Words for the front view's gems. Teeth are named as everywhere in the
 * Studio: their FDI number, then their type and quadrant (`useEditorLabels`).
 */
export function useFrontViewLabels() {
  const labels = useEditorLabels();
  const { t, toothName, sizeName, finishName } = labels;

  const shapeName = useCallback(
    (shape: string) => t(`studio.frontView.shapes.${isStudioShape(shape) ? shape : "round"}`),
    [t],
  );

  const colourName = useCallback(
    (piece: PlacedJewelry) =>
      [
        finishName(piece),
        t(`studio.frontView.materials.${piece.look.material === "metal" ? "metal" : "crystal"}`),
        piece.look.effect === "iridescent" ? t("studio.frontView.materials.iridescent") : null,
      ]
        .filter(Boolean)
        .join(" · "),
    [finishName, t],
  );

  const toothLabel = useCallback(
    (fdi: string) => (fdi === FREE_TOOTH ? toothName(fdi) : `${fdi} · ${toothName(fdi)}`),
    [toothName],
  );

  const describe = useCallback(
    (gem: FrontViewGem): GemDescription => ({
      tooth: toothLabel(gem.toothId),
      shape: shapeName(gem.shape),
      size: sizeName(gem.piece.ss),
      colour: colourName(gem.piece),
      note: !gem.at ? t("studio.frontView.notDrawn") : gem.at.facing === "back" ? t("studio.frontView.backFace") : null,
    }),
    [colourName, shapeName, sizeName, t, toothLabel],
  );

  return { ...labels, describe, shapeName, colourName, toothLabel };
}
