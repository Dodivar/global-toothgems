/**
 * Countries the shop delivers to.
 *
 * One list for the checkout address and the profile address: the two forms fill
 * the same field, so offering different countries in each would let a member
 * save an address that checkout cannot ship to. Labels are translated, never
 * derived from the UI language — language and country are separate dimensions.
 */
export const DELIVERY_COUNTRIES = ["fr", "de", "be", "ie"] as const;

export type DeliveryCountry = (typeof DELIVERY_COUNTRIES)[number];

/** i18n key of a country label, so callers never hard-code the namespace. */
export function countryLabelKey(code: string): string {
  return `countries.${code}`;
}
