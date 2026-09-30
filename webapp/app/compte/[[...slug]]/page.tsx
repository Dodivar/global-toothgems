import { renderZone, zoneMetadata, zonePath, type ZonePageProps } from "../../_zones/zonePage";
import { AccountZone } from "../../_zones/zones";

/** The member space and the community: the account zone (docs/migration-nextjs.md, phase 4). */
export async function generateMetadata(props: ZonePageProps) {
  return zoneMetadata(await zonePath("/compte", props));
}

export default async function Page(props: ZonePageProps) {
  return renderZone(await zonePath("/compte", props), props, AccountZone);
}
