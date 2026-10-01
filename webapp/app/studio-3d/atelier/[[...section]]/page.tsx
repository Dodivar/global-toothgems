import { zoneMetadata } from "../../../_zones/zonePage";
import { StudioEditorScreen } from "../../../../src/zones/studio";

type Props = { params: Promise<{ section?: string[] }> };

const pathOf = async ({ params }: Props) => ["/studio-3d/atelier", ...((await params).section ?? [])].join("/");

/** The Studio 3D editor and its sections (`studioUrl.ts`); an unknown section opens the editor. */
export async function generateMetadata(props: Props) {
  return zoneMetadata(await pathOf(props));
}

export default function Page() {
  return <StudioEditorScreen />;
}
