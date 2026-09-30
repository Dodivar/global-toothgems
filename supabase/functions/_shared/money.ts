/**
 * Money at the Postgres ↔ Stripe boundary (AGENTS.md §8): Postgres holds
 * `numeric(12,2)`, Stripe integer minor units. Converted by reading the decimal
 * digits, never by multiplying a float. Two-decimal currencies only (EUR),
 * like the rest of the schema.
 */

export function toMinorUnits(value: number | string): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Invalid money amount: ${String(value)}`);
  const [, whole, fraction = ""] = match;
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) throw new Error(`Money amount out of range: ${text}`);
  return minor;
}

/** `1234` → `"12.34"`: the exact decimal passed to a `numeric` argument. */
export function toDecimalString(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error(`Invalid minor amount: ${minor}`);
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return `${whole}.${String(cents).padStart(2, "0")}`;
}
