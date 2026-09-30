/**
 * The site is split into zones (docs/migration-nextjs.md, phase 4): each is
 * its own App Router segment mounting a React Router app reduced to that
 * zone's screens, so a page downloads only its zone's code. Moving between
 * two zones is a full page load.
 *
 * - `public`: storefront, public pages (`/fr/…`, `/en/…`), sign-in,
 *   registration and recovery, system pages — `app/[[...slug]]`
 * - `account`: member space and community (`/compte/*`) — `app/compte`
 * - `learn`: learner pages (`/academy/lecon`, `/academy/mes-formations/*`) — `app/academy/(learner)`
 * - `admin`: back office, its sign-in screen included (`/admin/*`) — `app/admin`
 * - `studio`: Studio 3D editor and share viewer (`/studio-3d/atelier/*`,
 *   `/studio-3d/partage/*`) — `app/studio-3d`
 *
 * Pure (no Next.js, no `window`): the zone apps and the tests import it.
 * Paths are the app's internal ones; private areas are never prefixed by a
 * language, so an address outside the four private zones is public.
 */

export type AppZone = "public" | "account" | "learn" | "admin" | "studio";

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function zoneOf(pathname: string): AppZone {
  if (under(pathname, "/compte")) return "account";
  if (pathname === "/academy/lecon" || /^\/academy\/mes-formations\/[^/]/.test(pathname)) return "learn";
  if (under(pathname, "/admin")) return "admin";
  if (under(pathname, "/studio-3d/atelier") || under(pathname, "/studio-3d/partage")) return "studio";
  return "public";
}
