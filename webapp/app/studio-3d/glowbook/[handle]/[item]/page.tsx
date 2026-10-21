import type { Metadata } from "next";
import { zoneMetadata } from "../../../../_zones/zonePage";
import { StudioShareScreen } from "../../../../../src/zones/studio";
import { findGlowbookCreationPreview } from "../../../../../src/lib/studioWorkspace/serverSharePreview";
import { sharePreviewMetadata } from "../../../../../src/lib/studioWorkspace/sharePreview";

type Props = { params: Promise<{ handle: string; item: string }> };

/**
 * A creation of an artist's public Glowbook in the read-only 3D viewer (`studio_public_showcase_creation`, decision 99).
 * Its `<head>` carries the creation's name, author and render for social preview cards (decision 101 addendum).
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle, item } = await params;
  const preview = await findGlowbookCreationPreview(handle, item).catch(() => null);
  return preview ? sharePreviewMetadata(preview) : zoneMetadata("/studio-3d/glowbook/x/y");
}

export default function Page() {
  return <StudioShareScreen />;
}
