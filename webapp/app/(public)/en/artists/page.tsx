import { DirectoryPage, directoryMetadata } from "../../../_public/directoryPage";

/** The artist directory (en): `/en/artists` (see `app/_public/directoryPage.tsx`). */
export function generateMetadata() {
  return directoryMetadata("en");
}

export default function Page() {
  return <DirectoryPage locale="en" />;
}
