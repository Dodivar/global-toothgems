import type { BadgeTone } from "../ui/Badge";
import type { BookingStatus } from "../../lib/glowbookBookingMapping";

/** The badge colour of each appointment status (decision 144); the status is always also written out. */
export const STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  booked: "brand",
  cancelled_client: "neutral",
  cancelled_artist: "neutral",
  honoured: "success",
  no_show: "warning",
};
