import { zoneOf, type AppZone } from "../appZones";
import { parsePath } from "../localeRoutes";
import { splitTo } from "./href";

/*
 * Transitional (docs/migration-nextjs.md, phase 5): the zones whose screens
 * are App Router segments of their own. A link from such a page to a zone
 * still mounted by a React Router app loads the page (as between zones in
 * phase 4); within native zones, navigation stays client-side. Grows zone by
 * zone, then disappears with React Router.
 */
const NATIVE_ZONES: ReadonlySet<AppZone> = new Set<AppZone>(["studio", "learn", "account", "admin", "public"]);

/** Whether the page at this address is an App Router segment of its own. */
export function isNativeAddress(address: string): boolean {
  return NATIVE_ZONES.has(zoneOf(parsePath(splitTo(address).pathname).internal));
}
