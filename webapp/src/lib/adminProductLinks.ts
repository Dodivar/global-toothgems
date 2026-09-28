import type { VariantStock } from "../data/adminCatalog";

/** Query parameter the edit screen reads to open the form on one option. */
export const OPTION_PARAM = "option";

/**
 * Edit screen of a product, opened on one of its options when one is given:
 * a pack/SS option or any other variant, both edited in the form.
 */
export function productEditPath(productId: string, variant?: VariantStock): string {
  const path = `/admin/produits/${productId}`;
  if (!variant) return path;
  // The key reads "50:6", "50:-" or a variant id; let URLSearchParams do the encoding.
  return `${path}?${new URLSearchParams({ [OPTION_PARAM]: variant.key })}`;
}
