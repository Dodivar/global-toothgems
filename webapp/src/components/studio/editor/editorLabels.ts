import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FREE_TOOTH, toothKeys, type PlacedJewelry } from "../../../data/studioEditor";
import { formatSs, formatSsMm } from "../../../lib/gemOptions";
import { useFormat } from "../../../lib/format";
import { useLocalized } from "../../../lib/localized";
import { useStudioGems } from "../../../lib/studio3d/useStudioGems";

/**
 * Customer-facing names of the editor's data, in the UI language.
 *
 * The pieces are shop products, named as the shop names them; the dentition
 * is identifiers in `data/studioEditor`. This hook is the one place that turns
 * them into words, so the panels, the context menu and the quote sheet all say
 * the same thing.
 */
export function useEditorLabels() {
  const { formatPrice } = useFormat();
  const { t, i18n } = useTranslation();
  const l = useLocalized();
  const { byKey } = useStudioGems();

  /** The shop product's name, or a plain word when the shop no longer sells it. */
  const pieceName = useCallback(
    (piece: Pick<PlacedJewelry, "productId">) => {
      const gem = byKey.get(piece.productId);
      return gem ? l(gem.name) : t("studio.editor.pieceUnavailable");
    },
    [byKey, l, t],
  );

  /** The colour variant's name ("Or blanc 18ct"), or null when the product comes in one colour. */
  const finishName = useCallback(
    (piece: Pick<PlacedJewelry, "productId" | "variantId">) => {
      const finish = piece.variantId ? byKey.get(piece.productId)?.finishes.find((f) => f.variantId === piece.variantId) : undefined;
      return finish?.name ? l(finish.name) : null;
    },
    [byKey, l],
  );

  /** "SS5 · ≈ 1,8 mm". */
  const sizeName = useCallback((ss: number) => [formatSs(ss), formatSsMm(ss, i18n.language)].filter(Boolean).join(" · "), [i18n.language]);

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

  const formatEstimate = useCallback((cents: number) => formatPrice(cents / 100), [formatPrice]);

  return { t, pieceName, finishName, sizeName, toothShort, toothName, toothTag, formatEstimate };
}
