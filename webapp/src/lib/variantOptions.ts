import {
  blankCustomVariant,
  type CustomVariant,
  type ProductImage,
  type VariantOption,
  type VariantOptionValue,
} from "../data/adminCatalog";
import type { Localized } from "../data/types";

/**
 * Back-office rules of the options a product's variants combine (colour ×
 * plug…, migration `…_product_variant_options`). Pure, unit-tested
 * (`variantOptions.test.ts`). The database re-checks every one of them and
 * derives the same names (`admin_save_product()`).
 */

/** Same limits as `admin_save_product()`. */
export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 30;
export const OPTION_NAME_MAX = 60;

const SEPARATOR = " · ";

function valueOf(options: VariantOption[], index: number, valueId: string | undefined): VariantOptionValue | undefined {
  return options[index]?.values.find((value) => value.id === valueId);
}

/** A combination's name: its values joined by " · ", an empty English name falling back to French. */
export function combinationName(options: VariantOption[], valueIds: string[]): Localized {
  const values = valueIds.map((id, index) => valueOf(options, index, id));
  return {
    fr: values.map((value) => value?.name.fr.trim() ?? "").join(SEPARATOR),
    en: values.map((value) => value?.name.en.trim() || value?.name.fr.trim() || "").join(SEPARATOR),
  };
}

/** A combination's colour dot: that of its first value with one. */
export function combinationSwatch(options: VariantOption[], valueIds: string[]): string | undefined {
  return valueIds.map((id, index) => valueOf(options, index, id)?.swatch).find(Boolean);
}

/** Every combination of the options' values, in option then value order. */
export function allCombinations(options: VariantOption[]): string[][] {
  if (options.length === 0) return [];
  return options.reduce<string[][]>(
    (combos, option) => combos.flatMap((combo) => option.values.map((value) => [...combo, value.id])),
    [[]],
  );
}

const keyOf = (valueIds: string[]) => valueIds.join(",");

/**
 * The variants once the options went from `previous` to `next`:
 *   - a variant keeps its id, price and stock while its values still exist;
 *   - an option just added gives every existing variant its first value;
 *   - a value no longer offered takes its combinations away;
 *   - each combination with a value just added is created, with an empty shelf;
 *   - the same combination twice (an option removed) keeps the first;
 *   - no options left: the variants stay, under the name they had.
 * Names and colour dots follow the values, the order follows the options.
 */
export function syncVariants(
  previous: VariantOption[],
  next: VariantOption[],
  variants: CustomVariant[],
  newId: () => string,
): CustomVariant[] {
  if (next.length === 0) {
    return variants.map(({ optionValues: _dropped, ...variant }) => variant);
  }
  const previousOptions = new Set(previous.map((option) => option.id));
  const previousValues = new Set(previous.flatMap((option) => option.values.map((value) => value.id)));
  const seen = new Set<string>();
  const result: CustomVariant[] = [];

  for (const variant of variants) {
    const had = new Map(previous.map((option, index) => [option.id, variant.optionValues?.[index]]));
    const values: string[] = [];
    for (const option of next) {
      const current = had.get(option.id);
      if (current && option.values.some((value) => value.id === current)) values.push(current);
      else if (!previousOptions.has(option.id) && option.values.length > 0) values.push(option.values[0].id);
      else break;
    }
    if (values.length !== next.length || seen.has(keyOf(values))) continue;
    seen.add(keyOf(values));
    result.push({ ...variant, optionValues: values });
  }

  const added = new Set(next.flatMap((option) => option.values.map((value) => value.id)).filter((id) => !previousValues.has(id)));
  if (added.size > 0) {
    for (const combo of allCombinations(next)) {
      if (!combo.some((id) => added.has(id)) || seen.has(keyOf(combo))) continue;
      seen.add(keyOf(combo));
      result.push({ ...blankCustomVariant(newId()), optionValues: combo });
    }
  }

  const rank = (variant: CustomVariant) =>
    (variant.optionValues ?? []).map((id, index) => next[index].values.findIndex((value) => value.id === id));
  return result
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      const at = ra.findIndex((r, i) => r !== rb[i]);
      return at < 0 ? 0 : ra[at] - rb[at];
    })
    .map((variant) => withDerivedName(next, variant));
}

/** A variant named and coloured after its values. */
function withDerivedName(options: VariantOption[], variant: CustomVariant): CustomVariant {
  const valueIds = variant.optionValues ?? [];
  const swatch = combinationSwatch(options, valueIds);
  const { swatch: _previous, ...rest } = variant;
  return { ...rest, name: combinationName(options, valueIds), ...(swatch ? { swatch } : {}) };
}

/** The combinations the options allow that no variant sells, in option order. */
export function missingCombinations(options: VariantOption[], variants: CustomVariant[]): string[][] {
  const sold = new Set(variants.map((variant) => keyOf(variant.optionValues ?? [])));
  return allCombinations(options).filter((combo) => !sold.has(keyOf(combo)));
}

/** Offers a combination again: a new variant with an empty shelf, in its place. */
export function addCombination(
  options: VariantOption[],
  variants: CustomVariant[],
  combo: string[],
  newId: () => string,
): CustomVariant[] {
  return syncVariants(options, options, [...variants, { ...blankCustomVariant(newId()), optionValues: combo }], newId);
}

/**
 * Turns a plain list of variants into a first option whose values are those
 * variants (name, colour dot, photos): every variant keeps its id, SKU,
 * price and stock, so a second option can then be added beside it.
 */
export function optionFromVariants(
  variants: CustomVariant[],
  media: ProductImage[],
  name: Localized,
  newId: () => string,
): { option: VariantOption; variants: CustomVariant[]; media: ProductImage[] } {
  const valueIds = new Map(variants.map((variant) => [variant.id, newId()]));
  const option: VariantOption = {
    id: newId(),
    name,
    values: variants.map((variant) => ({
      id: valueIds.get(variant.id)!,
      name: { ...variant.name },
      ...(variant.swatch ? { swatch: variant.swatch } : {}),
    })),
  };
  return {
    option,
    variants: variants.map((variant) => ({ ...variant, optionValues: [valueIds.get(variant.id)!] })),
    media: media.map((image) => {
      const valueId = image.variantId ? valueIds.get(image.variantId) : undefined;
      if (!valueId) return image;
      const { variantId: _moved, ...rest } = image;
      return { ...rest, optionValueId: valueId };
    }),
  };
}

/** Photos keep only links to variants and values that still exist. */
export function pruneMediaLinks(media: ProductImage[], options: VariantOption[], variants: CustomVariant[]): ProductImage[] {
  const values = new Set(options.flatMap((option) => option.values.map((value) => value.id)));
  const variantIds = new Set(variants.map((variant) => variant.id));
  return media.map(({ variantId, optionValueId, ...image }) => ({
    ...image,
    ...(variantId && variantIds.has(variantId) ? { variantId } : {}),
    ...(optionValueId && values.has(optionValueId) ? { optionValueId } : {}),
  }));
}

/** The first problem with the options, as a translation key; null when they can be saved. */
export function optionsProblem(options: VariantOption[]): "optionsNames" | "optionsDuplicate" | null {
  const named = (name: Localized) =>
    name.fr.trim().length > 0 && name.en.trim().length > 0 && name.fr.trim().length <= OPTION_NAME_MAX && name.en.trim().length <= OPTION_NAME_MAX;
  if (options.some((option) => !named(option.name) || option.values.length === 0 || option.values.some((value) => !named(value.name)))) {
    return "optionsNames";
  }
  const unique = (names: string[]) => new Set(names.map((name) => name.trim().toLowerCase())).size === names.length;
  if (!unique(options.map((option) => option.name.fr)) || options.some((option) => !unique(option.values.map((value) => value.name.fr)))) {
    return "optionsDuplicate";
  }
  return null;
}
