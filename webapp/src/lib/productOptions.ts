import type { ProductOption, ProductVariant } from "../data/products";

/**
 * Storefront logic of a product whose variants combine options (colour ×
 * plug…, migration `…_product_variant_options`): one row of choices per
 * option, each variant one combination. Pure, unit-tested
 * (`productOptions.test.ts`).
 */

type Pickable = Pick<ProductVariant, "id" | "stock" | "optionValues">;

/** Whether the variants can be shown as options: every one has a value of each option. */
export function hasOptionPicker(options: ProductOption[] | undefined, variants: Pickable[]): options is ProductOption[] {
  return (
    Boolean(options?.length) &&
    variants.length > 0 &&
    variants.every((v) => v.optionValues?.length === options!.length)
  );
}

/**
 * The variant to select when the customer picks `valueId` on option
 * `optionIndex`. The other options are kept when that combination exists and
 * can be bought; otherwise the combination with that value that keeps the
 * most of them (in stock first), so a click never lands on nothing.
 */
export function pickOptionVariant<T extends Pickable>(
  variants: T[],
  optionIndex: number,
  valueId: string,
  current: T | undefined,
): T | undefined {
  const want = [...(current?.optionValues ?? [])];
  want[optionIndex] = valueId;
  const candidates = variants.filter((v) => v.optionValues?.[optionIndex] === valueId);
  const kept = (v: T) => (v.optionValues ?? []).filter((id, i) => i !== optionIndex && id === want[i]).length;
  const ranked = [...candidates].sort(
    (a, b) => Number(a.stock === "out") - Number(b.stock === "out") || kept(b) - kept(a),
  );
  const exact = candidates.find((v) => kept(v) === want.length - 1);
  if (exact && exact.stock !== "out") return exact;
  return ranked[0];
}

/**
 * What a value of an option offers, the other options staying as chosen:
 *   "available" — that combination can be bought;
 *   "elsewhere" — not with the other choices, but with others (picking it
 *                 moves them);
 *   "out"       — no combination with this value can be bought.
 */
export type OptionValueState = "available" | "elsewhere" | "out";

export function optionValueState(
  variants: Pickable[],
  optionIndex: number,
  valueId: string,
  current: Pickable | undefined,
): OptionValueState {
  const withValue = variants.filter((v) => v.optionValues?.[optionIndex] === valueId && v.stock !== "out");
  if (withValue.length === 0) return "out";
  const others = current?.optionValues ?? [];
  const same = withValue.some((v) => (v.optionValues ?? []).every((id, i) => i === optionIndex || id === others[i]));
  return same ? "available" : "elsewhere";
}

/**
 * The variants a product card summarises: with a colour option (values with
 * a dot), one entry per colour — sold out only when every combination of
 * that colour is — instead of one dot per combination; otherwise the
 * variants themselves.
 */
export function cardVariants(product: { variants?: ProductVariant[]; options?: ProductOption[] }): ProductVariant[] | undefined {
  const variants = product.variants;
  if (!variants || !hasOptionPicker(product.options, variants)) return variants;
  const index = product.options.findIndex((option) => option.values.some((value) => value.swatch));
  if (index < 0) return variants;
  return product.options[index].values.flatMap((value) => {
    const combos = variants.filter((v) => v.optionValues?.[index] === value.id);
    if (combos.length === 0) return [];
    const cheapest = combos.reduce((low, v) => (v.price < low.price ? v : low));
    return [{
      id: value.id,
      name: value.name,
      price: cheapest.price,
      ...(value.swatch ? { swatch: value.swatch } : {}),
      ...(combos.every((v) => v.stock === "out") ? { stock: "out" as const } : {}),
    }];
  });
}
