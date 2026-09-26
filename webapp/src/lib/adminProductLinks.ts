import type { VariantStock } from "../data/adminCatalog";

/** Query parameter the edit screen reads to open the form on one pack/SS option. */
export const OPTION_PARAM = "option";

/**
 * Edit screen of a product, opened on one of its options when that option is
 * a pack/SS one — the only kind the form edits. Any other variant opens the
 * product itself.
 */
export function productEditPath(productId: string, variant?: VariantStock): string {
  const path = `/admin/produits/${productId}`;
  if (!variant?.gemOption) return path;
  // The key reads "50:6" or "50:-"; let URLSearchParams do the encoding.
  return `${path}?${new URLSearchParams({ [OPTION_PARAM]: variant.key })}`;
}
