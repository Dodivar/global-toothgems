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

/** 404 for an address the zone has no screen for, the sign-in redirect for a signed-out visitor, else the zone. */
export async function renderZone(path: string, props: ZonePageProps, Zone: ComponentType) {
  if (!isKnownPath(path)) notFound();
  await guardAddress(path, searchOf(await props.searchParams));
  return <Zone />;
}
