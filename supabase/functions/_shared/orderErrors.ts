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
  | "gift_card_invalid"
  | "payment_unavailable"
  | "server_error";

export interface DbError {
  code?: string;
  message?: string;
}

export function checkoutErrorCode(error: DbError): CheckoutErrorCode {
  const message = error.message ?? "";
  if (error.code === "P0001") return "out_of_stock";
  if (/promotion code|loyalty reward/.test(message)) return "promotion_code_invalid";
  if (/gift card/.test(message)) return "gift_card_invalid";
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
