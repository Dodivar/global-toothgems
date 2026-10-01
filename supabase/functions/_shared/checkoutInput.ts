/**
 * Strict validation of what the browser sends to `create-checkout-session`.
 *
 * Only identifiers, quantities, contact details and codes are accepted: no
 * price, total, discount or currency ever comes from the client — create_order()
 * computes them. Anything unexpected (unknown key, wrong type, out-of-range
 * value) rejects the whole request. Pure: no Deno or network API, so it is
 * unit-tested with `deno test`.
 */

export const CHECKOUT_LOCALES = ["fr", "en"] as const;
export type CheckoutLocale = (typeof CHECKOUT_LOCALES)[number];

export interface CheckoutAddress {
  first_name: string;
  last_name: string;
  address_line1: string;
  address_line2?: string;
  postal_code: string;
  city: string;
  country_code: string;
  phone?: string;
}

export interface CheckoutItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
}

export interface CheckoutInput {
  items: CheckoutItem[];
  email: string;
  address: CheckoutAddress;
  shipping_rate_id: string;
  locale: CheckoutLocale;
  promotion_codes: string[];
  gift_card_codes: string[];
  customer_note: string | null;
}

export type ValidationResult =
  | { ok: true; value: CheckoutInput }
  | { ok: false; field: string };

/** Same bounds as create_order(): 1–100 lines, 1–1000 per line, ≤ 3 codes, ≤ 5 gift cards. */
export const MAX_ITEMS = 100;
export const MAX_QUANTITY = 1000;
export const MAX_PROMOTION_CODES = 3;
export const MAX_GIFT_CARDS = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const POSTAL_RE = /^[A-Za-z0-9][A-Za-z0-9 -]{0,19}$/;
const PHONE_RE = /^\+?[0-9 ().-]{4,30}$/;
const PROMO_RE = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const GIFT_CARD_RE = /^GT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
// Control characters have no business in a name or an address.
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

type Fail = { ok: false; field: string };
const fail = (field: string): Fail => ({ ok: false, field });

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return key;
  return null;
}

function text(value: unknown, max: number, { optional = false } = {}): string | null | undefined {
  if (value === undefined || value === null || value === "") return optional ? undefined : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return optional ? undefined : null;
  if (trimmed.length > max || CONTROL_RE.test(trimmed)) return null;
  return trimmed;
}

const ADDRESS_KEYS = [
  "first_name",
  "last_name",
  "address_line1",
  "address_line2",
  "postal_code",
  "city",
  "country_code",
  "phone",
] as const;

function parseAddress(value: unknown): { ok: true; value: CheckoutAddress } | Fail {
  if (!isObject(value)) return fail("address");
  const unknown = onlyKeys(value, ADDRESS_KEYS);
  if (unknown) return fail(`address.${unknown}`);

  const firstName = text(value.first_name, 100);
  if (!firstName) return fail("address.first_name");
  const lastName = text(value.last_name, 100);
  if (!lastName) return fail("address.last_name");
  const line1 = text(value.address_line1, 200);
  if (!line1) return fail("address.address_line1");
  const line2 = text(value.address_line2, 200, { optional: true });
  if (line2 === null) return fail("address.address_line2");
  const postal = text(value.postal_code, 20);
  if (!postal || !POSTAL_RE.test(postal)) return fail("address.postal_code");
  const city = text(value.city, 100);
  if (!city) return fail("address.city");
  const country = typeof value.country_code === "string" ? value.country_code.trim().toUpperCase() : "";
  if (!COUNTRY_RE.test(country)) return fail("address.country_code");
  const phone = text(value.phone, 30, { optional: true });
  if (phone === null || (phone !== undefined && !PHONE_RE.test(phone))) return fail("address.phone");

  return {
    ok: true,
    value: {
      first_name: firstName,
      last_name: lastName,
      address_line1: line1,
      ...(line2 ? { address_line2: line2 } : {}),
      postal_code: postal,
      city,
      country_code: country,
      ...(phone ? { phone } : {}),
    },
  };
}

function parseItems(value: unknown): { ok: true; value: CheckoutItem[] } | Fail {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ITEMS) return fail("items");
  const items: CheckoutItem[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of value.entries()) {
    if (!isObject(raw) || onlyKeys(raw, ["product_id", "variant_id", "quantity"])) return fail(`items.${index}`);
    const { product_id, variant_id, quantity } = raw;
    if (typeof product_id !== "string" || !UUID_RE.test(product_id)) return fail(`items.${index}.product_id`);
    if (variant_id !== undefined && variant_id !== null && (typeof variant_id !== "string" || !UUID_RE.test(variant_id))) {
      return fail(`items.${index}.variant_id`);
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return fail(`items.${index}.quantity`);
    }
    const variant = typeof variant_id === "string" ? variant_id.toLowerCase() : null;
    const key = `${product_id.toLowerCase()}::${variant ?? ""}`;
    if (seen.has(key)) return fail(`items.${index}`);
    seen.add(key);
    items.push({ product_id: product_id.toLowerCase(), variant_id: variant, quantity });
  }
  return { ok: true, value: items };
}

function parseCodes(value: unknown, max: number, pattern: RegExp): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max) return null;
  const codes = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") return null;
    const code = raw.trim().toUpperCase();
    if (!pattern.test(code)) return null;
    codes.add(code);
  }
  return [...codes];
}

const INPUT_KEYS = [
  "items",
  "email",
  "address",
  "shipping_rate_id",
  "locale",
  "promotion_codes",
  "gift_card_codes",
  "customer_note",
] as const;

export function parseCheckoutInput(body: unknown): ValidationResult {
  if (!isObject(body)) return fail("body");
  const unknown = onlyKeys(body, INPUT_KEYS);
  if (unknown) return fail(unknown);

  const items = parseItems(body.items);
  if (!items.ok) return items;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_RE.test(email) || CONTROL_RE.test(email)) return fail("email");

  const address = parseAddress(body.address);
  if (!address.ok) return address;

  if (typeof body.shipping_rate_id !== "string" || !UUID_RE.test(body.shipping_rate_id)) return fail("shipping_rate_id");

  if (typeof body.locale !== "string" || !(CHECKOUT_LOCALES as readonly string[]).includes(body.locale)) {
    return fail("locale");
  }

  const promotionCodes = parseCodes(body.promotion_codes, MAX_PROMOTION_CODES, PROMO_RE);
  if (!promotionCodes) return fail("promotion_codes");
  const giftCardCodes = parseCodes(body.gift_card_codes, MAX_GIFT_CARDS, GIFT_CARD_RE);
  if (!giftCardCodes) return fail("gift_card_codes");

  const note = text(body.customer_note, 1000, { optional: true });
  if (note === null) return fail("customer_note");

  return {
    ok: true,
    value: {
      items: items.value,
      email,
      address: address.value,
      shipping_rate_id: body.shipping_rate_id.toLowerCase(),
      locale: body.locale as CheckoutLocale,
      promotion_codes: promotionCodes,
      gift_card_codes: giftCardCodes,
      customer_note: note ?? null,
    },
  };
}
