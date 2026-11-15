"use client";

import { useEffect, useState } from "react";
import { type BookingReturn, readBookingReturn, withoutBookingReturn } from "../../lib/glowbookBookingReturn";

/**
 * The choice an address brings back from the sign-in screen, read once
 * hydrated (and once `enabled`: the page knows it takes bookings), then taken
 * out of the address so a reload or a shared link does not reopen the dialog.
 */
export function useBookingReturn(enabled: boolean): BookingReturn | null {
  const [found, setFound] = useState<BookingReturn | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const { pathname, search, hash } = window.location;
    const choice = readBookingReturn(search);
    if (!choice) return;
    setFound(choice);
    window.history.replaceState(window.history.state, "", `${pathname}${withoutBookingReturn(search)}${hash}`);
  }, [enabled]);
  return found;
}
