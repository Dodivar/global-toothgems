/** Ids and defaults shared by the variant editors (`CustomVariantsEditor`, `VariantOptionsEditor`). */

/** Default colour of a dot being added: a neutral grey the administrator changes. */
export const DEFAULT_SWATCH = "#d9d9d9";

/** Id of one field of a variant card, for labels and the arrival focus. */
export function fieldId(variantId: string, field: string): string {
  return `variant-${variantId}-${field}`;
}
