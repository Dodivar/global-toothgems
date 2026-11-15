import { DirectoryCityPage, directoryCityMetadata, type DirectoryCityProps } from "../../../../_public/directoryPage";

/** The artists of one city (fr): `/fr/artistes/<city>` (see `app/_public/directoryPage.tsx`). */
export function generateMetadata(props: DirectoryCityProps) {
  return directoryCityMetadata(props, "fr");
}

export default function Page(props: DirectoryCityProps) {
  return <DirectoryCityPage props={props} locale="fr" />;
}
