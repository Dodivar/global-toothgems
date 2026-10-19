import { zoneMetadata } from "../../../../_zones/zonePage";
import { StudioShareScreen } from "../../../../../src/zones/studio";

/** A creation of an artist's public Glowbook in the read-only 3D viewer (`studio_public_showcase_creation`, decision 99). */
export const metadata = zoneMetadata("/studio-3d/glowbook/x/y");

export default function Page() {
  return <StudioShareScreen />;
}
