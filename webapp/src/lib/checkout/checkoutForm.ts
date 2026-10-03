import type { CartLine } from "./cartLines";
import { checkoutItems } from "./cartLines";
import type { CheckoutRequest } from "./api";

/**
 * The cart's contact and delivery form. Checked here for the customer's
 * benefit only; the Edge Function validates everything again.
 */

export interface CheckoutForm {
  firstName: string;
  lastName: string;
  email: string;
  street: string;
  postalCode: string;
  city: string;
  /** Lower-case, as in `data/countries.ts`. */
  country: string;
}

export type CheckoutField = keyof CheckoutForm | "shipping";

export const EMPTY_CHECKOUT_FORM: CheckoutForm = {
  firstName: "",
  lastName: "",
  email: "",
  street: "",
  postalCode: "",
  city: "",
  country: "fr",
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/;

/**
 * Fields that stop the payment, in the order they appear. A basket of gift
 * cards only is not shipped: no delivery rate is asked for (the address is
 * still the order's billing address).
 */
export function invalidFields(form: CheckoutForm, shippingRateId: string | null, shipping = true): CheckoutField[] {
  const invalid: CheckoutField[] = [];
  if (!form.firstName.trim()) invalid.push("firstName");
  if (!form.lastName.trim()) invalid.push("lastName");
  if (!EMAIL_RE.test(form.email.trim())) invalid.push("email");
  if (!form.street.trim()) invalid.push("street");
  if (!POSTAL_RE.test(form.postalCode.trim())) invalid.push("postalCode");
  if (!form.city.trim()) invalid.push("city");
  if (!/^[a-z]{2}$/.test(form.country)) invalid.push("country");
  if (shipping && !shippingRateId) invalid.push("shipping");
  return invalid;
}

/** Null when the basket cannot be priced by the database (lines outside the Supabase catalogue). */
export function buildCheckoutRequest(
  lines: CartLine[],
  form: CheckoutForm,
  shippingRateId: string | null,
  locale: "fr" | "en",
  giftCardCodes: string[] = [],
  useLoyaltyReward = false,
): CheckoutRequest | null {
  const items = checkoutItems(lines);
  if (!items || items.length === 0) return null;
  return {
    items,
    email: form.email.trim(),
    address: {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      address_line1: form.street.trim(),
      postal_code: form.postalCode.trim(),
      city: form.city.trim(),
      country_code: form.country.toUpperCase(),
    },
    shipping_rate_id: shippingRateId,
    locale,
    // Codes go as typed (normalised); the function and the database decide what they cover.
    ...(giftCardCodes.length > 0 ? { gift_card_codes: giftCardCodes } : {}),
    ...(useLoyaltyReward ? { use_loyalty_reward: true } : {}),
  };
}
