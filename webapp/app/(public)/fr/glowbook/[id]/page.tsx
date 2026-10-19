import { GlowbookPage, glowbookMetadata, type GlowbookPageProps } from "../../../../_public/glowbookPage";

/** An artist's Glowbook (French): `/fr/glowbook/<handle>` (see `app/_public/glowbookPage.tsx`). */
export function generateMetadata(props: GlowbookPageProps) {
  return glowbookMetadata(props, "fr");
}

export default function Page(props: GlowbookPageProps) {
  return <GlowbookPage props={props} locale="fr" />;
}
