"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import { fetchStudioAccess } from "../../lib/studioAccessApi";
import { GLOWBOOK_INTRO_PATH, studioSectionPath } from "../../lib/studioUrl";

/**
 * Where the header's Studio "Glowbook" entry leads: the member's own Glowbook
 * (to edit) when their plan includes it, the presentation page otherwise
 * (signed out, below the plan, or not known yet).
 *
 * The header sits outside `StudioAccessProvider`, so the answer is read once
 * from the database (`studio_access_state()`) the first time the Studio menu
 * is opened by a signed-in member, and kept for that account. Display only:
 * the editor's Glowbook section and the database enforce the plan.
 *
 * `bookings` says whether the plan also runs the calendar (decision 153:
 * Atelier or staff; the Artist plan has the Glowbook without it).
 */
export function useGlowbookMenuTarget(menuOpen: boolean): { target: string; bookings: boolean } {
  const { userId, realAuth } = useAuth();
  const live = isSupabaseConfigured && realAuth;
  const [known, setKnown] = useState<{ userId: string; glowbook: boolean; bookings: boolean } | null>(null);

  useEffect(() => {
    if (!live || !userId || !menuOpen || known?.userId === userId) return;
    let cancelled = false;
    fetchStudioAccess()
      .then((info) => {
        if (!cancelled) setKnown({ userId, glowbook: info.glowbook, bookings: info.bookings });
      })
      .catch(() => {
        /* Unknown: the presentation page stays the target. */
      });
    return () => {
      cancelled = true;
    };
  }, [live, userId, menuOpen, known]);

  if (!live) return { target: GLOWBOOK_INTRO_PATH, bookings: false };
  const mine = known && known.userId === userId ? known : null;
  return { target: mine?.glowbook ? studioSectionPath("glowbook") : GLOWBOOK_INTRO_PATH, bookings: mine?.bookings === true };
}
