import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { GEM_SHAPES } from "../../data/products";
import { useCatalog } from "../../lib/catalog/CatalogProvider";
import { useLocalized } from "../../lib/localized";
import { FILTER_PARAMS, type FilterKey } from "../../lib/storefrontFilters";

/**
 * Display label of a filter value, shared by the panel, its collapsed-group
 * summaries and the active-filter chips so all three always agree.
 */
export function useFilterLabels() {
  const { t } = useTranslation();
  const L = useLocalized();
  const { colors } = useCatalog();
  return useCallback(
    (key: FilterKey, value: string): string => {
      switch (key) {
        case "category":
          return value === FILTER_PARAMS.category.fallback ? t("shop.categories.all") : t(`shop.categories.${value}`, { defaultValue: value });
        case "material":
          // Materials are catalogue data; the known ones have a translation,
          // the rest show as entered. A dot would read as a key path.
          return value === "all" ? t("shop.materials.all") : value.includes(".") ? value : t(`shop.materials.${value}`, { defaultValue: value });
        case "shape":
          // A slug outside the taxonomy can still arrive from a hand-edited URL.
          return value === "all" ? t("shop.shapes.all") : (GEM_SHAPES as string[]).includes(value) ? t(`shop.shapes.${value}`) : value;
        case "color": {
          if (value === "all") return t("shop.colors.all");
          const def = colors.find((c) => c.slug === value);
          return def ? L(def.name) : value;
        }
        case "price":
          return t(`shop.priceBands.${value}`, { defaultValue: value });
        case "stock":
          return t(`shop.stockBands.${value}`, { defaultValue: value });
      }
    },
    [t, L, colors],
  );
}
