/**
 * Coming back to a Glowbook booking after signing in (decision 144). A
 * visitor picks a design and an hour before being asked for an account; the
 * page's address carries that choice through the sign-in screen, which sends
 * them back to it, so the booking dialog opens again where they left it.
 * Pure: the callers read and rewrite `window.location` in effects.
 */

export const BOOKING_RETURN_PARAMS = { open: "reserver", item: "creation", slot: "creneau" } as const;

export interface BookingReturn {
  itemId: string | null;
  slot: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The page's address with the choice in its query (other parameters kept). */
export function bookingReturnPath(pathname: string, search: string, choice: BookingReturn): string {
  const params = new URLSearchParams(search);
  for (const key of Object.values(BOOKING_RETURN_PARAMS)) params.delete(key);
  params.set(BOOKING_RETURN_PARAMS.open, "1");
  if (choice.itemId) params.set(BOOKING_RETURN_PARAMS.item, choice.itemId);
  if (choice.slot) params.set(BOOKING_RETURN_PARAMS.slot, choice.slot);
  return `${pathname}?${params.toString()}`;
}

/** The choice carried by an address, or null when it asks for no booking. Unknown shapes are dropped. */
export function readBookingReturn(search: string): BookingReturn | null {
  const params = new URLSearchParams(search);
  if (params.get(BOOKING_RETURN_PARAMS.open) !== "1") return null;
  const item = params.get(BOOKING_RETURN_PARAMS.item);
  const slot = params.get(BOOKING_RETURN_PARAMS.slot);
  return {
    itemId: item && UUID.test(item) ? item : null,
    slot: slot && !Number.isNaN(Date.parse(slot)) ? slot : null,
  };
}

/** The query without the booking parameters ("" when nothing is left), so a reload does not reopen the dialog. */
export function withoutBookingReturn(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of Object.values(BOOKING_RETURN_PARAMS)) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
