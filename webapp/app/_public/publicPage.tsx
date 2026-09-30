import type { ComponentType } from "react";
import { localizedPath, type Locale, type PublicRouteId } from "../../src/lib/localeRoutes";
import { addressMetadata } from "./metadata";

type Props = { params: Promise<Record<string, string | string[] | undefined>> };

/**
 * A public page in one language (docs/migration-nextjs.md, phase 5): its
 * segment is its address (`/fr/boutique`, `/en/shop`), its `<head>` comes
 * from the table of public pages, and `Screen` — a client component — is
 * rendered on the server and hydrated. Product pages have their own
 * (`productPage.tsx`).
 */
export function publicScreen(id: PublicRouteId, locale: Locale, Screen: ComponentType) {
  const pathOf = async ({ params }: Props) => {
    const values = Object.fromEntries(Object.entries(await params).map(([key, value]) => [key, decodeURIComponent(String(value ?? ""))]));
    return localizedPath(id, locale, values);
  };
  return {
    generateMetadata: async (props: Props) => addressMetadata(await pathOf(props)),
    Page: function PublicPage() {
      return <Screen />;
    },
  };
}
