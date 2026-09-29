import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { pick } from "../../data/types";
import { FALLBACK_TAXONOMY, findCategory, findFamily, type ShopCategoryDef } from "../../data/taxonomy";
import { useCatalog } from "./CatalogProvider";

export interface TaxonomyApi {
  taxonomy: ShopCategoryDef[];
  /**
   * Name of a category in the reading language. Until the taxonomy has
   * loaded, the prototype's names stand in; the slug itself if unknown.
   */
  categoryName: (slug: string) => string;
  familyName: (slug: string) => string;
}

/** The shop taxonomy with its labels in the reading language. */
export function useTaxonomy(): TaxonomyApi {
  const { taxonomy } = useCatalog();
  const { i18n } = useTranslation();
  const lang = i18n.language;
  return useMemo(
    () => ({
      taxonomy,
      categoryName: (slug) => {
        const category = findCategory(taxonomy, slug) ?? findCategory(FALLBACK_TAXONOMY, slug);
        return category ? pick(category.name, lang) : slug;
      },
      familyName: (slug) => {
        const match = findFamily(taxonomy, slug) ?? findFamily(FALLBACK_TAXONOMY, slug);
        return match ? pick(match.family.name, lang) : slug;
      },
    }),
    [taxonomy, lang],
  );
}
