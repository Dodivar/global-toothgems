import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import { isKnownPath, parsePath } from "../../src/lib/localeRoutes";
import { pageMeta } from "../../src/lib/pageMeta";
import { searchOf } from "../_public/search";
import { guardAddress } from "./guard";

/*
 * The pages of the private zones (docs/migration-nextjs.md, phase 4): each
 * segment mounts its zone's React Router app (`src/zones/`) in the browser
 * only, with the `<head>` and status the catch-all page gave them before.
 */

export type ZonePageProps = {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The address of a zone page: its segment's `base` followed by the catch-all part, if any. */
export async function zonePath(base: string, { params }: ZonePageProps) {
  const rest = (await params).slug ?? [];
  return rest.length > 0 ? `${base}/${rest.join("/")}` : base;
}

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
 * redirect for a signed-out visitor) and renders `Screen`, a client
 * component. Private areas stay out of search engines.
 */
export function zoneScreen(path: string | ((params: Record<string, string>) => string), Screen: ComponentType) {
  const pathOf = async ({ params }: ScreenProps) => {
    if (typeof path === "string") return path;
    const values = Object.fromEntries(Object.entries(await params).map(([key, value]) => [key, Array.isArray(value) ? value.join("/") : (value ?? "")]));
    return path(values);
  };
  return {
    generateMetadata: async (props: ScreenProps) => zoneMetadata(await pathOf(props)),
    Page: async function ZoneScreenPage(props: ScreenProps) {
      await guardPage(await pathOf(props), props);
      return <Screen />;
    },
  };
}

/** 404 for an address the zone has no screen for, the sign-in redirect for a signed-out visitor, else the zone. */
export async function renderZone(path: string, props: ZonePageProps, Zone: ComponentType) {
  if (!isKnownPath(path)) notFound();
  await guardAddress(path, searchOf(await props.searchParams));
  return <Zone />;
}
