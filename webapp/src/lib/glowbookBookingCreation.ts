/**
 * The Studio creation a member wants an artist to make (decision 149), kept
 * for the browser tab while they look for an artist: chosen from the Studio
 * ("Book an artist for this design"), read by the booking dialog, which
 * selects it in "My creation". A convenience only: the booking itself sends
 * the creation id, and the database checks it belongs to the member.
 */

export const BOOKING_CREATION_KEY = "gt-booking-creation";
/** A choice older than this is forgotten. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BookingCreationChoice {
  id: string;
  name: string;
}

/** The stored choice, or null when missing, malformed or stale. Pure. */
export function parseBookingCreation(raw: string | null, now: number): BookingCreationChoice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { id?: unknown; name?: unknown; at?: unknown };
    if (typeof value.id !== "string" || !UUID.test(value.id)) return null;
    if (typeof value.at !== "number" || now - value.at > MAX_AGE_MS || value.at > now + 60_000) return null;
    return { id: value.id.toLowerCase(), name: typeof value.name === "string" ? value.name.slice(0, 120) : "" };
  } catch {
    return null;
  }
}

export function rememberBookingCreation(choice: BookingCreationChoice): void {
  try {
    window.sessionStorage.setItem(BOOKING_CREATION_KEY, JSON.stringify({ id: choice.id, name: choice.name, at: Date.now() }));
  } catch {
    /* Storage blocked: the member picks the creation in the dialog instead. */
  }
}

export function readBookingCreation(): BookingCreationChoice | null {
  try {
    return parseBookingCreation(window.sessionStorage.getItem(BOOKING_CREATION_KEY), Date.now());
  } catch {
    return null;
  }
}

export function forgetBookingCreation(): void {
  try {
    window.sessionStorage.removeItem(BOOKING_CREATION_KEY);
  } catch {
    /* Nothing to forget. */
  }
}
