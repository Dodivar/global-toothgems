import { DirectoryCityPage, directoryCityMetadata, type DirectoryCityProps } from "../../../../_public/directoryPage";

/** The artists of one city (en): `/en/artists/<city>` (see `app/_public/directoryPage.tsx`). */
export function generateMetadata(props: DirectoryCityProps) {
  return directoryCityMetadata(props, "en");
}

export default function Page(props: DirectoryCityProps) {
  return <DirectoryCityPage props={props} locale="en" />;
}
