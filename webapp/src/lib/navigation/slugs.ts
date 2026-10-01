import { useMemo } from "react";
import { useCourseSlugTranslator } from "../academy/AcademyProvider";
import { useSlugTranslator as useProductSlugTranslator } from "../catalog/CatalogProvider";
import type { ParamTranslator } from "../localeRoutes";

/**
 * Slugs of each language in addresses: products (`/en/shop/<English slug>`)
 * and courses (`/en/academy/course/<English slug>`), from what the catalogue
 * and the Academy stores hold — the server's seed on the server and on the
 * first browser render alike, so both write the same `href`.
 */
export function useSlugTranslator(): ParamTranslator {
  const products = useProductSlugTranslator();
  const courses = useCourseSlugTranslator();
  return useMemo<ParamTranslator>(() => (id, params, locale) => courses(id, products(id, params, locale), locale), [products, courses]);
}
