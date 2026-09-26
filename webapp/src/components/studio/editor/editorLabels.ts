import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FREE_TOOTH, isFinishId, toothKeys, type PlacedJewelry } from "../../../data/studioEditor";
import { formatPrice } from "../../../lib/format";

/**
 * Customer-facing names of the editor's data, in the UI language.
 *
 * The catalog, the finishes and the dentition are identifiers in
 * `data/studioEditor`; this hook is the one place that turns them into words,
 * so the panels, the context menu and the quote sheet all say the same thing.
 */
export function useEditorLabels() {
  const { t } = useTranslation();

  const pieceName = useCallback((typeId: string) => t(`studio.editor.pieces.${typeId}`, { defaultValue: typeId }), [t]);

  const finishName = useCallback(
    (j: Pick<PlacedJewelry, "color" | "customColor">) =>
      j.customColor
        ? t("studio.editor.finishes.customValue", { hex: j.customColor.toUpperCase() })
        : t(`studio.editor.finishes.${isFinishId(j.color) ? j.color : "clear"}`),
    [t],
  );

  /** "Canine" — the tooth type alone. */
  const toothShort = useCallback(
    (fdi: string) => {
      const keys = toothKeys(fdi);
      return keys ? t(`studio.editor.teeth.${keys.tooth}`) : t("studio.editor.freePlacement");
    },
    [t],
  );

  /** "Canine · upper right" — the tooth type and its quadrant. */
  const toothName = useCallback(
    (fdi: string) => {
      const keys = toothKeys(fdi);
      if (!keys) return t("studio.editor.freePlacementLong");
      return t("studio.editor.toothName", { tooth: t(`studio.editor.teeth.${keys.tooth}`), side: t(`studio.editor.sides.${keys.side}`) });
    },
    [t],
  );

  /** The tooth number as a customer reads it: "11", or "—" off the labelled arch. */
  const toothTag = useCallback((fdi: string) => (fdi === FREE_TOOTH ? "—" : fdi), []);

  const formatEstimate = useCallback((cents: number) => formatPrice(cents / 100), []);

  return { t, pieceName, finishName, toothShort, toothName, toothTag, formatEstimate };
}
