import { DirectoryPage, directoryMetadata } from "../../../_public/directoryPage";

/** The artist directory (fr): `/fr/artistes` (see `app/_public/directoryPage.tsx`). */
export function generateMetadata() {
  return directoryMetadata("fr");
}

export default function Page() {
  return <DirectoryPage locale="fr" />;
}
