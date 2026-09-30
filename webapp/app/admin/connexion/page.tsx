import { renderZone, zoneMetadata, zonePath, type ZonePageProps } from "../../_zones/zonePage";
import { AdminZone } from "../../_zones/zones";

/** The back office's access screen, open: the admin zone (docs/migration-nextjs.md, phase 4). */
export async function generateMetadata(props: ZonePageProps) {
  return zoneMetadata(await zonePath("/admin/connexion", props));
}

export default async function Page(props: ZonePageProps) {
  return renderZone(await zonePath("/admin/connexion", props), props, AdminZone);
}
