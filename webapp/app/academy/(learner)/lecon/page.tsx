import { renderZone, zoneMetadata, zonePath, type ZonePageProps } from "../../../_zones/zonePage";
import { LearnZone } from "../../../_zones/zones";

/** The learner's entry point: the learn zone (docs/migration-nextjs.md, phase 4). */
export async function generateMetadata(props: ZonePageProps) {
  return zoneMetadata(await zonePath("/academy/lecon", props));
}

export default async function Page(props: ZonePageProps) {
  return renderZone(await zonePath("/academy/lecon", props), props, LearnZone);
}
