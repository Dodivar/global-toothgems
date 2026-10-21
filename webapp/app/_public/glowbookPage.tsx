import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { truncate } from "../../src/lib/catalog/productMeta";
import { localizedPath, type Locale } from "../../src/lib/localeRoutes";
import { SITE_NAME, uiText } from "../../src/lib/pageMeta";
import { findPublicGlowbook } from "../../src/lib/studioWorkspace/serverGlowbook";
import { GlowbookPublic } from "../../src/screens/GlowbookPublic";
import { publicPageMetadata } from "./metadata";

/**
 * An artist's Glowbook, `/fr/glowbook/<handle>` and `/en/glowbook/<handle>`
 * (decision 99): the public, read-only showcase they link from their
 * Instagram bio. The server reads it on every request (`serverGlowbook.ts`)
 * and answers 404 when there is no public page behind the handle (unknown,
 * waiting for moderation, rejected, author without Studio access). A handle
 * written with capitals moves (308) to its lower-case address.
 */
export type GlowbookPageProps = { params: Promise<{ id: string }> };

async function glowbookFor(props: GlowbookPageProps, locale: Locale) {
  const { id } = await props.params;
  const key = decodeURIComponent(id);
  const glowbook = await findPublicGlowbook(key);
  if (!glowbook) notFound();
  if (glowbook.handle !== key) permanentRedirect(localizedPath("glowbook", locale, { id: glowbook.handle }));
  return glowbook;
}

export async function glowbookMetadata(props: GlowbookPageProps, locale: Locale): Promise<Metadata> {
  const glowbook = await glowbookFor(props, locale);
  const name = (key: string) => uiText(locale, key).replace("{{name}}", glowbook.displayName);
  return publicPageMetadata({
    title: `${name("studio.glowbook.public.metaTitle")} · ${SITE_NAME}`,
    description: truncate(glowbook.bio.replace(/\s+/g, " ").trim() || name("studio.glowbook.public.metaDescription")),
    locale,
    alternates: {
      fr: localizedPath("glowbook", "fr", { id: glowbook.handle }),
      en: localizedPath("glowbook", "en", { id: glowbook.handle }),
    },
    // The spotlight creation first (the page opens on it; no banner since decision 103), else the first render.
    image:
      glowbook.items.find((i) => i.id === glowbook.look?.featuredItemId && i.imageUrl)?.imageUrl ??
      glowbook.items.find((i) => i.imageUrl)?.imageUrl ??
      glowbook.avatarUrl ??
      undefined,
  });
}

export async function GlowbookPage({ props, locale }: { props: GlowbookPageProps; locale: Locale }) {
  return <GlowbookPublic glowbook={await glowbookFor(props, locale)} />;
}
