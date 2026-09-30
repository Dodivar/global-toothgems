import { zoneMetadata } from "../../_zones/zonePage";
import { StudioShareScreen } from "../../../src/zones/studio";

/** A shared Studio design carried in the address's fragment (`studioWorkspace/share.ts`). */
export const metadata = zoneMetadata("/studio-3d/partage");

export default function Page() {
  return <StudioShareScreen />;
}
