/**
 * create_order() errors → the short codes the storefront translates.
 * Neither the SQL message nor any identifier it carries reaches the browser.
 */

export type CheckoutErrorCode =
  | "invalid_request"
  | "unavailable"
  | "out_of_stock"
  | "shipping_unavailable"
  | "promotion_code_invalid"
  | "loyalty_reward_unavailable"
  | "gift_card_invalid"
  | "gift_card_details_invalid"
  | "account_required"
  | "terms_required"
  | "course_owned"
  | "payment_unavailable"
  | "server_error";

export interface DbError {
  code?: string;
  message?: string;
}

/**
 * Gift cards appear in two roles. As a means of payment, every refusal (unknown
 * code, expired, empty, cancelled, other currency, too many) is the same
 * "not usable" answer, so the response never tells a guesser which codes exist.
 * As a line being bought, the buyer's details or amount were refused.
 * The ledger trigger raises P0001 too: checked before the stock meaning of P0001.
 */
const GIFT_CARD_PAYMENT_RE = /gift card not usable|gift card is not usable|gift card balance insufficient|gift cards per order/;
const GIFT_CARD_PURCHASE_RE = /gift card amount not allowed|gift card details|one gift card per line|delivery date not allowed/;

export function checkoutErrorCode(error: DbError): CheckoutErrorCode {
  const message = error.message ?? "";
  // Courses: sold to an account (access is granted to it), once per member.
  if (/a course requires a customer account/.test(message)) return "account_required";
  if (/course .* is already held/.test(message)) return "course_owned";
  if (/course .* is not (available|sold in)|course .* has no price/.test(message)) return "unavailable";
  if (GIFT_CARD_PAYMENT_RE.test(message)) return "gift_card_invalid";
  if (GIFT_CARD_PURCHASE_RE.test(message)) return "gift_card_details_invalid";
  // "gift cards are not on sale" / "are sold in": the gift card product is unavailable.
  if (/gift cards are/.test(message)) return "unavailable";
  if (error.code === "P0001") return "out_of_stock";
  // Spending the card: no completed card (or already reserved by an unpaid order), no account, other currency.
  if (/loyalty reward/.test(message)) return "loyalty_reward_unavailable";
  if (/promotion code/.test(message)) return "promotion_code_invalid";
  if (/shipping/.test(message)) return "shipping_unavailable";
  if (error.code === "P0002") return "unavailable";
  if (error.code === "22023" || error.code === "22P02" || error.code === "42501") return "invalid_request";
  return "server_error";
}

/** HTTP status of a checkout error: the customer's basket or input (409 / 400) versus ours (5xx). */
export function checkoutErrorStatus(code: CheckoutErrorCode): number {
  switch (code) {
    case "invalid_request":
      return 400;
    case "server_error":
      return 500;
    case "payment_unavailable":
      return 502;
    default:
      return 409;
  }
}
