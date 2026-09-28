import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { shapesInCatalog, sortByShapeLabel, type Product, type ShapeGroup } from "../../data/products";

/**
 * Shapes that have gems behind them, alphabetical in the reading language.
 *
 * Every shape list a shopper sees (carousels, /formes, the shop filter) goes
 * through here, so they all share one order and it follows a language switch.
 */
export function useShapesInCatalog(products: Product[]): ShapeGroup[] {
  const { t, i18n } = useTranslation();
  return useMemo(
    () => sortByShapeLabel(shapesInCatalog(products), (group) => group.shape, (shape) => t(`shop.shapes.${shape}`), i18n.language),
    [products, t, i18n.language],
  );
}
