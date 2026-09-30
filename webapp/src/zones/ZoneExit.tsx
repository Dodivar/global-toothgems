import { useEffect } from "react";
import { useLocation } from "../lib/navigation";
import { zoneOf, type AppZone } from "../lib/appZones";
import { NotFound } from "../screens/NotFound";
import { useHydrated } from "../lib/useHydrated";

/*
 * Moving between zones (`lib/appZones.ts`). Each zone's React Router app only
 * knows its own screens, so a link to another zone reaches its `*` route.
 * There, `ZoneExit` reloads the page: React Router has already put the new
 * address in the address bar, the server answers it with the right zone, and
 * the history entry keeps its state across the reload (the page to return to
 * after sign-in, for instance). An address no zone has is the 404 screen, as
 * before.
 *
 * Guard against a loop (a zone table out of step with `app/`): the address
 * being reloaded is noted for the tab; if the page comes back to the same
 * zone app at that address, it shows the 404 screen instead of reloading
 * again. The zone that owns the address clears the note (`ZoneArrival`).
 */
const RELOAD_KEY = "gt-zone-reload";

function readNote(): string | null {
  try {
    return window.sessionStorage.getItem(RELOAD_KEY);
  } catch {
    return null;
  }
}

function writeNote(value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(RELOAD_KEY);
    else window.sessionStorage.setItem(RELOAD_KEY, value);
  } catch {
    // Storage blocked: the loop guard is lost, the navigation still works.
  }
}

/** The `*` route of a zone: another zone's address reloads, an unknown one is the 404 screen. */
export function ZoneExit({ zone }: { zone: AppZone }) {
  const { pathname } = useLocation();
  const hydrated = useHydrated();
  const leaving = zoneOf(pathname) !== zone;
  // Back at an address this page already reloaded for: the loop guard.
  const stuck = leaving && hydrated && readNote() === window.location.href;

  useEffect(() => {
    if (!leaving || stuck) return;
    writeNote(window.location.href);
    window.location.reload();
  }, [leaving, stuck, pathname]);

  if (!leaving || stuck) return <NotFound />;
  return <div aria-busy="true" className="min-h-[60vh]" />;
}

/** Clears the loop guard once the zone that owns the address is showing it. */
export function ZoneArrival({ zone }: { zone: AppZone }) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (zoneOf(pathname) === zone) writeNote(null);
  }, [zone, pathname]);
  return null;
}
