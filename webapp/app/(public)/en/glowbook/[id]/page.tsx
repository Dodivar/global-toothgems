import { GlowbookPage, glowbookMetadata, type GlowbookPageProps } from "../../../../_public/glowbookPage";

/** An artist's Glowbook (English): `/en/glowbook/<handle>` (see `app/_public/glowbookPage.tsx`). */
export function generateMetadata(props: GlowbookPageProps) {
  return glowbookMetadata(props, "en");
}

export default function Page(props: GlowbookPageProps) {
  return <GlowbookPage props={props} locale="en" />;
}
