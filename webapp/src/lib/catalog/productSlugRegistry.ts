import type { ParamTranslator } from "../localeRoutes";
import { productSlugTranslator, type SluggedProduct } from "./productSlugs";

/*
 * The product slugs of the catalogue the browser has loaded, for the localized
 * history (`lib/localizedHistory.ts`): links to `/boutique/<French slug>` get
 * the English slug under `/en/shop`, and the language switch moves a product
 * page to its slug in the other language. Filled by `CatalogProvider` as soon
 * as the catalogue is known, before any product link renders. Until then, and
 * for a product it does not know, slugs are left as they are: the server
 * redirects such an address (308) to the right one.
 */

let current: ParamTranslator = (_id, params) => params;

export function registerProductSlugs(products: readonly SluggedProduct[]) {
  current = productSlugTranslator(products);
}

export const translateProductSlugs: ParamTranslator = (id, params, locale) => current(id, params, locale);
