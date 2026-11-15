import type { Metadata } from "next";
import { zoneMetadata } from "../../../_zones/zonePage";
import { StudioShareScreen } from "../../../../src/zones/studio";

/**
 * A client's own Studio creation joined to a Glowbook booking (decision 148), read-only, for the
 * booked artist and the client only (`glowbook_booking_creation`, read in the browser as the
 * signed-in member). Never indexed; no preview card: the design is not public.
 */
export const metadata: Metadata = zoneMetadata("/studio-3d/partage/x");

export default function Page() {
  return <StudioShareScreen />;
}
