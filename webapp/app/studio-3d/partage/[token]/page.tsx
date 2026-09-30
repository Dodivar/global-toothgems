import { zoneMetadata } from "../../../_zones/zonePage";
import { StudioShareScreen } from "../../../../src/zones/studio";

/** A saved Studio design shared by its token (`creation_shares`, read through `studio_shared_creation`). */
export const metadata = zoneMetadata("/studio-3d/partage/x");

export default function Page() {
  return <StudioShareScreen />;
}
