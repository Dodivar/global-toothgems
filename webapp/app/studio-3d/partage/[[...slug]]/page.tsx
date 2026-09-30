import { renderZone, zoneMetadata, zonePath, type ZonePageProps } from "../../../_zones/zonePage";
import { StudioZone } from "../../../_zones/zones";

/** A shared Studio design: the studio zone (docs/migration-nextjs.md, phase 4). */
export async function generateMetadata(props: ZonePageProps) {
  return zoneMetadata(await zonePath("/studio-3d/partage", props));
}

export default async function Page(props: ZonePageProps) {
  return renderZone(await zonePath("/studio-3d/partage", props), props, StudioZone);
}
