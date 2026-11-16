"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import { fetchStudioAccess } from "../../lib/studioAccessApi";

interface KnownPlan {
  userId: string;
  glowbook: boolean;
  bookings: boolean;
}

/**
 * The signed-in member's Glowbook rights, for the member space and the header,
 * which sit outside `StudioAccessProvider`: read once from the database
 * (`studio_access_state()`) per account. Each flag is `null` while unknown.
 * Display only — the editor and the database enforce the plan. Without
 * Supabase (mock mode) everything is shown open, as in the preview.
 *
 *   * `glowbook` — the public page (decision 152: Artist, Atelier or staff);
 *   * `bookings` — online bookings, the calendar and the directory listing
 *     (decision 152: Atelier or staff).
 */
function useKnownPlan(): KnownPlan | null | "open" {
  const { userId, realAuth } = useAuth();
  const live = isSupabaseConfigured && realAuth;
  const [known, setKnown] = useState<KnownPlan | null>(null);

  useEffect(() => {
    if (!live || !userId || known?.userId === userId) return;
    let cancelled = false;
    fetchStudioAccess()
      .then((info) => {
        if (!cancelled) setKnown({ userId, glowbook: info.glowbook, bookings: info.bookings });
      })
      .catch(() => {
        /* Unknown: the entry stays neutral. */
      });
    return () => {
      cancelled = true;
    };
  }, [live, userId, known]);

  if (!live) return "open";
  return known && known.userId === userId ? known : null;
}

/** Whether the member's plan includes the Glowbook page; null while unknown. */
export function useGlowbookPlanKnown(): boolean | null {
  const known = useKnownPlan();
  return known === "open" ? true : known ? known.glowbook : null;
}

/** Whether the member's plan includes bookings, the calendar and the directory; null while unknown. */
export function useBookingsPlanKnown(): boolean | null {
  const known = useKnownPlan();
  return known === "open" ? true : known ? known.bookings : null;
}

/** Both rights from one read, for a component that needs the two (the member-space menu). */
export function useGlowbookRightsKnown(): { glowbook: boolean | null; bookings: boolean | null } {
  const known = useKnownPlan();
  if (known === "open") return { glowbook: true, bookings: true };
  return { glowbook: known ? known.glowbook : null, bookings: known ? known.bookings : null };
}
