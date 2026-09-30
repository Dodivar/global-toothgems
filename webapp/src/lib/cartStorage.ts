import type { CartLine } from "./cart";

/*
 * The cart kept for the browser tab (sessionStorage), decided by the owner on
 * 2026-09-30 for phase 4 of docs/migration-nextjs.md: moving between zones of
 * the site is a full page load, which would otherwise empty the cart. Until
 * the real checkout exists this is the cart's only persistence; prices shown
 * from it are indicative, the order is priced by the database.
 */

export const CART_STORAGE_KEY = "gt-cart";

const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const isOptionalText = (value: unknown) => value === undefined || typeof value === "string";

function parseLine(value: unknown): CartLine | null {
  if (typeof value !== "object" || value === null) return null;
  const line = value as Record<string, unknown>;
  const { id, productId, variantId, name, variant, image, price, qty } = line;
  if (!isText(id) || !isText(productId) || !isText(name) || typeof image !== "string") return null;
  if (!isOptionalText(variantId) || !isOptionalText(variant)) return null;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) return null;
  return {
    id,
    productId,
    name,
    image,
    price,
    qty,
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
