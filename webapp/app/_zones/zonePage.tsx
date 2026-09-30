import type { Metadata } from "next";
import type { ReactNode } from "react";
import { parsePath } from "../../src/lib/localeRoutes";
import { pageMeta } from "../../src/lib/pageMeta";
import { searchOf } from "../_public/search";
import { guardAddress } from "./guard";

/*
 * The pages of the private zones (docs/migration-nextjs.md, phases 4–5): one
 * App Router segment per screen, rendered in the browser only under its
 * zone's chrome (`src/zones/ZoneChrome.tsx`), with the `<head>` the
 * catch-all page gave them before and the server's session check.
 */

/** Private areas stay out of search engines; their tab title is the site name. */
export function zoneMetadata(path: string): Metadata {
  return { title: pageMeta(parsePath(path)).title, robots: { index: false, follow: false } };
}

/** Search parameters, as every page is given them. */
export type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The server check of a native zone page (phase 5): the sign-in redirect for a
 * signed-out visitor, with the page's own address and query.
 */
export async function guardPage(path: string, { searchParams }: SearchProps) {
  await guardAddress(path, searchOf(await searchParams));
}

type ScreenProps = SearchProps & { params: Promise<Record<string, string | string[] | undefined>> };

/**
 * A native zone page (phase 5): `path` gives the page's address from its
 * segment's parameters; the page checks the session with it (sign-in
 * redirect for a signed-out visitor) and renders `screen`, a client
 * component. Private areas stay out of search engines.
 */
export function zoneScreen(path: string | ((params: Record<string, string>) => string), screen: ReactNode) {
  const pathOf = async ({ params }: ScreenProps) => {
    if (typeof path === "string") return path;
    const values = Object.fromEntries(Object.entries(await params).map(([key, value]) => [key, Array.isArray(value) ? value.join("/") : (value ?? "")]));
    return path(values);
  };
  return {
    generateMetadata: async (props: ScreenProps) => zoneMetadata(await pathOf(props)),
    Page: async function ZoneScreenPage(props: ScreenProps) {
      await guardPage(await pathOf(props), props);
      return screen;
    },
  };
}
