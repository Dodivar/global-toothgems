import { toMinorUnits } from "../catalog/money";

/**
 * Delivery options shown in the cart. Rates and zones are public (RLS), read
 * with the publishable key; the customer picks one and its id goes to the
 * checkout, where create_order() checks again that it serves the destination
 * and the basket and computes the price — nothing here is trusted.
 */

export type ShippingKind = "standard" | "express" | "free" | "pickup";

export interface ShippingRateRow {
  id: string;
  kind: string;
  min_days: number;
  max_days: number;
  price: number | string;
  currency: string;
  free_over_amount: number | string | null;
  min_order_amount: number | string | null;
  max_order_amount: number | string | null;
  position: number;
}

export interface ShippingOption {
  id: string;
  kind: ShippingKind;
  minDays: number;
  maxDays: number;
  /** Minor units, for the basket it was computed for. */
  price: number;
  currency: string;
  /** Minor units from which this rate is free, if ever. */
  freeOver: number | null;
}

const KINDS: readonly ShippingKind[] = ["standard", "express", "free", "pickup"];
const minor = (value: number | string | null) => (value === null ? null : toMinorUnits(value));

/**
 * The rates that apply to a basket of `goods` (minor units, before discounts —
 * as create_order() does), cheapest first. Weight bounds are left to the
 * server: the cart does not know the parcel's weight.
 */
export function applicableRates(rows: ShippingRateRow[], goods: number, currency: string): ShippingOption[] {
  return rows
    .filter((row) => row.currency === currency && (KINDS as readonly string[]).includes(row.kind))
    .filter((row) => {
      const min = minor(row.min_order_amount);
      const max = minor(row.max_order_amount);
      return (min === null || goods >= min) && (max === null || goods <= max);
    })
    .map((row) => {
      const freeOver = minor(row.free_over_amount);
      return {
        id: row.id,
        kind: row.kind as ShippingKind,
        minDays: row.min_days,
        maxDays: row.max_days,
        price: freeOver !== null && goods >= freeOver ? 0 : toMinorUnits(row.price),
        currency: row.currency,
        freeOver,
        position: row.position,
      };
    })
    .sort((a, b) => a.price - b.price || a.position - b.position)
    .map(({ position: _position, ...option }) => option);
}

/** The option to keep selected: the customer's choice while it still applies, else the cheapest. */
export function pickRate(options: ShippingOption[], chosen: string | null): string | null {
  if (chosen && options.some((o) => o.id === chosen)) return chosen;
  return options[0]?.id ?? null;
}

/**
 * Lowest amount of goods from which delivery becomes free with one of the
 * zone's rates (a `free` rate's minimum or a `free_over_amount`), or null.
 */
export function freeShippingThreshold(rows: ShippingRateRow[], currency: string): number | null {
  const thresholds = rows
    .filter((row) => row.currency === currency)
    .flatMap((row) => [
      row.kind === "free" ? minor(row.min_order_amount) ?? 0 : null,
      minor(row.free_over_amount),
    ])
    .filter((value): value is number => value !== null && value > 0);
  return thresholds.length > 0 ? Math.min(...thresholds) : null;
}
