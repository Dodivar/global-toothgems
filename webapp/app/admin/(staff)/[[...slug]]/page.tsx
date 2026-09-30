import { renderZone, zoneMetadata, zonePath, type ZonePageProps } from "../../../_zones/zonePage";
import { AdminZone } from "../../../_zones/zones";

/** The back office: the admin zone (docs/migration-nextjs.md, phase 4). */
export async function generateMetadata(props: ZonePageProps) {
  return zoneMetadata(await zonePath("/admin", props));
}

export default async function Page(props: ZonePageProps) {
  return renderZone(await zonePath("/admin", props), props, AdminZone);
}
