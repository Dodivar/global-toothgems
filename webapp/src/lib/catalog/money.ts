/**
 * Money conversion between the database and the UI.
 *
 * Postgres stores `numeric(12,2)` and PostgREST sends it as a JSON number
 * (sometimes a string). Amounts are converted to integer minor units by
 * reading the decimal digits, never by multiplying a float, so `19.99` is
 * always exactly 1999.
 *
 * The UI still formats major units (`formatPrice(49)`), so `toMajorUnits` is
 * for display only. Prices shown here are indicative: the checkout recomputes
 * every amount server-side in `create_order()`.
 */
export function toMinorUnits(value: number | string, fractionDigits = 2): number {
  const text = typeof value === "number" ? value.toFixed(fractionDigits) : value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`Invalid money amount: ${String(value)}`);
  const [, sign, whole, fraction = ""] = match;
  if (fraction.length > fractionDigits && /[1-9]/.test(fraction.slice(fractionDigits))) {
    throw new Error(`Money amount has more than ${fractionDigits} decimals: ${text}`);
  }
  const minor = Number(whole) * 10 ** fractionDigits + Number(fraction.slice(0, fractionDigits).padEnd(fractionDigits, "0"));
  return sign ? -minor : minor;
}

export function toMajorUnits(minor: number, fractionDigits = 2): number {
  return minor / 10 ** fractionDigits;
}
