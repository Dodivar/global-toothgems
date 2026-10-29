import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { shapeName, shapesInCatalog, sortByShapeLabel, type Product, type ShapeGroup } from "../../data/products";

/**
 * Shapes that have gems behind them, alphabetical by name.
 *
 * Every shape list a shopper sees (carousels, /formes, the shop filter) goes
 * through here, so they all share one order.
 */
export function useShapesInCatalog(products: Product[]): ShapeGroup[] {
  const { i18n } = useTranslation();
  return useMemo(
    () => sortByShapeLabel(shapesInCatalog(products), (group) => group.shape, shapeName, i18n.language),
    [products, i18n.language],
  );
}
