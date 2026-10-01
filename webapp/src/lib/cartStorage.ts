import { MAX_LINE_QTY, type CartLine } from "./checkout/cartLines";

/*
 * The cart kept for the browser tab (sessionStorage), decided by the owner on
 * 2026-09-30 (docs/migration-nextjs.md, phase 4, kept in phase 5): moving
 * between pages keeps the stores in memory, but a reload, an address typed in
 * or a return from another site would otherwise empty the cart. Until
 * the real checkout exists this is the cart's only persistence; prices shown
 * from it are indicative (minor units), the order is priced by the database.
 * A cart stored in an older shape (float `price`) is discarded, not converted.
 */

export const CART_STORAGE_KEY = "gt-cart";

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isOptionalText = (value: unknown) => value === undefined || typeof value === "string";

function parseLine(value: unknown): CartLine | null {
  if (typeof value !== "object" || value === null) return null;
  const line = value as Record<string, unknown>;
  const { id, productId, dbProductId, variantId, name, variant, image, unitPrice, currency, qty } = line;
  if (!isText(id) || !isText(productId) || !isText(name) || typeof image !== "string") return null;
  if (!isOptionalText(dbProductId) || !isOptionalText(variantId) || !isOptionalText(variant)) return null;
  if (typeof unitPrice !== "number" || !Number.isSafeInteger(unitPrice) || unitPrice < 0) return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > MAX_LINE_QTY) return null;
  return {
    id,
    productId,
    name,
    image,
    unitPrice,
    currency,
    qty,
    ...(dbProductId === undefined ? {} : { dbProductId: dbProductId as string }),
    ...(variantId === undefined ? {} : { variantId: variantId as string }),
    ...(variant === undefined ? {} : { variant: variant as string }),
  };
}

/** The stored cart, or null when there is none or it cannot be read (any malformed line discards it). */
export function parseStoredCart(raw: string | null): CartLine[] | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  const lines = value.map(parseLine);
  return lines.every((line): line is CartLine => line !== null) ? lines : null;
}

export function readStoredCart(): CartLine[] | null {
  try {
    return parseStoredCart(window.sessionStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredCart(lines: CartLine[]) {
  try {
    window.sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Private mode or blocked storage: the cart simply lasts this page.
  }
}
