/**
 * Working-day arithmetic for delivery estimates: the storefront promises each
 * shipping rate as "min to max working days", and the back office pre-fills a
 * parcel's estimated delivery with the day it is shipped + the order's
 * `shipping_max_days` (decision 109 in `supabase/README.md`).
 *
 * Working days are Monday to Friday. Public holidays are not known here: the
 * date is only a suggestion the team can change. Dates are ISO calendar days
 * (`YYYY-MM-DD`), computed in UTC so no time zone or DST shifts them.
 */

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `day` + `count` working days. A weekend start counts from the next Monday. */
export function addWorkingDays(day: string, count: number): string {
  const match = ISO_DAY.exec(day);
  if (!match || !Number.isInteger(count) || count < 0) throw new RangeError(`addWorkingDays(${day}, ${count})`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const isWeekend = () => date.getUTCDay() === 0 || date.getUTCDay() === 6;
  while (isWeekend()) date.setUTCDate(date.getUTCDate() + 1);
  for (let left = count; left > 0; ) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (!isWeekend()) left -= 1;
  }
  return date.toISOString().slice(0, 10);
}

/** Today in the browser's own calendar, as `YYYY-MM-DD`. Call it in an effect or handler, never during render. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The estimated delivery to offer for a parcel shipped on `shippedOn`, or ""
 * when the order carries no promised delay (no rate, older order).
 */
export function suggestedDelivery(shippedOn: string, maxDays: number | null | undefined): string {
  return maxDays == null ? "" : addWorkingDays(shippedOn, maxDays);
}
