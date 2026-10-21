import type { Metadata } from "next";
import { zoneMetadata } from "../../../_zones/zonePage";
import { StudioShareScreen } from "../../../../src/zones/studio";
import { findSharedCreationPreview } from "../../../../src/lib/studioWorkspace/serverSharePreview";
import { sharePreviewMetadata } from "../../../../src/lib/studioWorkspace/sharePreview";

type Props = { params: Promise<{ token: string }> };

/**
 * A saved Studio design shared by its token (`creation_shares`, read through `studio_shared_creation`).
 * Its `<head>` names the creation and carries its render, for the preview cards of social networks
 * (decision 101 addendum); an unknown or revoked link keeps the generic head.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const preview = await findSharedCreationPreview((await params).token).catch(() => null);
  return preview ? sharePreviewMetadata(preview) : zoneMetadata("/studio-3d/partage/x");
}

export default function Page() {
  return <StudioShareScreen />;
}
