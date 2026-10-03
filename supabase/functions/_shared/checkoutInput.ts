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

export const GIFT_CARD_DESIGNS = ["sparkle", "blush", "noir", "mint", "photo"] as const;
export type GiftCardDesign = (typeof GIFT_CARD_DESIGNS)[number];

/**
 * What the buyer types for a gift card line. The amount is the one value of a
 * checkout chosen by the customer: integer minor units, checked by
 * create_order() against gift_card_settings (presets or the custom range).
 */
export interface GiftCardLine {
  amount_minor: number;
  recipient_email: string;
  recipient_name: string | null;
  sender_name: string | null;
  message: string | null;
  design: GiftCardDesign | null;
  /** ISO 8601 with an offset; null = sent as soon as the order is paid. */
  deliver_at: string | null;
}

export interface CheckoutItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  gift_card?: GiftCardLine;
}

export interface CheckoutInput {
  /** Product and gift card lines (may be empty when the basket holds courses only). */
  items: CheckoutItem[];
  /**
   * Academy courses (`courses.id`), one seat each, sent as `{course_id, quantity: 1}`
   * lines of `items`. A course is not a product: create_order() prices it, requires
   * the buyer's account and refuses a course they already hold.
   */
  course_ids: string[];
  email: string;
  address: CheckoutAddress;
  /** Null when the basket has nothing to ship (gift cards only); create_order() decides. */
  shipping_rate_id: string | null;
  locale: CheckoutLocale;
  promotion_codes: string[];
  gift_card_codes: string[];
  /**
   * Spend the member's completed loyalty card on this order. A request, never an
   * amount: create_order() checks the account, the card and the currency, and
   * computes the discount.
   */
  use_loyalty_reward: boolean;
  customer_note: string | null;
}

export type ValidationResult =
  | { ok: true; value: CheckoutInput }
  | { ok: false; field: string };

/** Same bounds as create_order(): 1–100 lines, 1–1000 per line, ≤ 3 codes, ≤ 5 gift cards. */
export const MAX_ITEMS = 100;
/** Upper bound of a gift card amount accepted at all (€100,000); the shop's own range is checked in SQL. */
export const MAX_GIFT_CARD_MINOR = 10_000_000;
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
// A gift message may span lines; nothing else below U+0020.
const MESSAGE_CONTROL_RE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

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

const GIFT_CARD_KEYS = [
  "amount_minor",
  "recipient_email",
  "recipient_name",
  "sender_name",
  "message",
  "design",
  "deliver_at",
] as const;

function parseGiftCard(value: unknown, path: string): { ok: true; value: GiftCardLine } | Fail {
  if (!isObject(value)) return fail(path);
  const unknown = onlyKeys(value, GIFT_CARD_KEYS);
  if (unknown) return fail(`${path}.${unknown}`);
  const amount = value.amount_minor;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 1 || amount > MAX_GIFT_CARD_MINOR) {
    return fail(`${path}.amount_minor`);
  }
  const email = typeof value.recipient_email === "string" ? value.recipient_email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL_RE.test(email) || CONTROL_RE.test(email)) return fail(`${path}.recipient_email`);
  const recipientName = text(value.recipient_name, 100, { optional: true });
  if (recipientName === null) return fail(`${path}.recipient_name`);
  const senderName = text(value.sender_name, 100, { optional: true });
  if (senderName === null) return fail(`${path}.sender_name`);
  let message: string | null = null;
  if (value.message !== undefined && value.message !== null && value.message !== "") {
    if (typeof value.message !== "string") return fail(`${path}.message`);
    const trimmed = value.message.replace(/\r\n?/g, "\n").trim();
    if (trimmed.length > 1000 || MESSAGE_CONTROL_RE.test(trimmed)) return fail(`${path}.message`);
    message = trimmed || null;
  }
  const design = value.design ?? null;
  if (design !== null && !(GIFT_CARD_DESIGNS as readonly unknown[]).includes(design)) return fail(`${path}.design`);
  const deliverAt = value.deliver_at ?? null;
  if (deliverAt !== null && (typeof deliverAt !== "string" || !DATE_TIME_RE.test(deliverAt) || Number.isNaN(Date.parse(deliverAt)))) {
    return fail(`${path}.deliver_at`);
  }
  return {
    ok: true,
    value: {
      amount_minor: amount,
      recipient_email: email,
      recipient_name: recipientName ?? null,
      sender_name: senderName ?? null,
      message,
      design: design as GiftCardDesign | null,
      deliver_at: deliverAt as string | null,
    },
  };
}

function parseItems(value: unknown): { ok: true; value: CheckoutItem[]; courses: string[] } | Fail {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ITEMS) return fail("items");
  const items: CheckoutItem[] = [];
  const courses: string[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of value.entries()) {
    if (isObject(raw) && "course_id" in raw) {
      // A course line names the course and nothing else; one seat, never merged.
      if (onlyKeys(raw, ["course_id", "quantity"])) return fail(`items.${index}`);
      const { course_id, quantity } = raw;
      if (typeof course_id !== "string" || !UUID_RE.test(course_id)) return fail(`items.${index}.course_id`);
      if (quantity !== undefined && quantity !== 1) return fail(`items.${index}.quantity`);
      const id = course_id.toLowerCase();
      if (courses.includes(id)) return fail(`items.${index}`);
      courses.push(id);
      continue;
    }
    if (!isObject(raw) || onlyKeys(raw, ["product_id", "variant_id", "quantity", "gift_card"])) return fail(`items.${index}`);
    const { product_id, variant_id, quantity } = raw;
    if (typeof product_id !== "string" || !UUID_RE.test(product_id)) return fail(`items.${index}.product_id`);
    if (variant_id !== undefined && variant_id !== null && (typeof variant_id !== "string" || !UUID_RE.test(variant_id))) {
      return fail(`items.${index}.variant_id`);
    }
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return fail(`items.${index}.quantity`);
    }
    const variant = typeof variant_id === "string" ? variant_id.toLowerCase() : null;
    if (raw.gift_card !== undefined) {
      // One card per line, several lines allowed (one per recipient).
      if (variant !== null || quantity !== 1) return fail(`items.${index}`);
      const card = parseGiftCard(raw.gift_card, `items.${index}.gift_card`);
      if (!card.ok) return card;
      items.push({ product_id: product_id.toLowerCase(), variant_id: null, quantity: 1, gift_card: card.value });
      continue;
    }
    const key = `${product_id.toLowerCase()}::${variant ?? ""}`;
    if (seen.has(key)) return fail(`items.${index}`);
    seen.add(key);
    items.push({ product_id: product_id.toLowerCase(), variant_id: variant, quantity });
  }
  return { ok: true, value: items, courses };
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
  "use_loyalty_reward",
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

  const rate = body.shipping_rate_id ?? null;
  if (rate !== null && (typeof rate !== "string" || !UUID_RE.test(rate))) return fail("shipping_rate_id");

  if (typeof body.locale !== "string" || !(CHECKOUT_LOCALES as readonly string[]).includes(body.locale)) {
    return fail("locale");
  }

  const promotionCodes = parseCodes(body.promotion_codes, MAX_PROMOTION_CODES, PROMO_RE);
  if (!promotionCodes) return fail("promotion_codes");
  const giftCardCodes = parseCodes(body.gift_card_codes, MAX_GIFT_CARDS, GIFT_CARD_RE);
  if (!giftCardCodes) return fail("gift_card_codes");

  const useLoyaltyReward = body.use_loyalty_reward ?? false;
  if (typeof useLoyaltyReward !== "boolean") return fail("use_loyalty_reward");

  const note = text(body.customer_note, 1000, { optional: true });
  if (note === null) return fail("customer_note");

  return {
    ok: true,
    value: {
      items: items.value,
      course_ids: items.courses,
      email,
      address: address.value,
      shipping_rate_id: rate === null ? null : (rate as string).toLowerCase(),
      locale: body.locale as CheckoutLocale,
      promotion_codes: promotionCodes,
      gift_card_codes: giftCardCodes,
      use_loyalty_reward: useLoyaltyReward,
      customer_note: note ?? null,
    },
  };
}

/** A course line as create_order() reads it. */
export interface OrderCourseItem {
  course_id: string;
  quantity: 1;
}

/** A line as create_order() reads it (`p_items`). */
export interface OrderItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  /** Decimal string of the gift card amount (numeric argument), gift card lines only. */
  amount?: string;
  gift_card?: {
    recipient_email: string;
    recipient_name: string | null;
    sender_name: string | null;
    message: string | null;
    design?: GiftCardDesign;
    deliver_at: string | null;
  };
}

/**
 * Validated items → create_order()'s `p_items`: the gift card amount crosses
 * from minor units to the decimal string Postgres reads (AGENTS.md §8), the
 * design is left out when the buyer kept the shop's default.
 */
export function orderItems(items: CheckoutItem[], toDecimal: (minor: number) => string): OrderItem[] {
  return items.map((item) => {
    if (!item.gift_card) return { product_id: item.product_id, variant_id: item.variant_id, quantity: item.quantity };
    const { amount_minor, design, ...details } = item.gift_card;
    return {
      product_id: item.product_id,
      variant_id: null,
      quantity: 1,
      amount: toDecimal(amount_minor),
      gift_card: { ...details, ...(design ? { design } : {}) },
    };
  });
}

/** Validated course ids → create_order() course lines, after the shop lines. */
export const courseOrderItems = (courseIds: string[]): OrderCourseItem[] =>
  courseIds.map((course_id) => ({ course_id, quantity: 1 }));
