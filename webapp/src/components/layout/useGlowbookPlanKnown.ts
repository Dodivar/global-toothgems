"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import { fetchStudioAccess } from "../../lib/studioAccessApi";

/**
 * Whether the signed-in member's plan includes the Glowbook (Atelier or active
 * staff), for the member-space menu, which sits outside `StudioAccessProvider`:
 * read once from the database (`studio_access_state()`) per account. `null`
 * while unknown. Display only — the editor and the database enforce the plan.
 * Without Supabase (mock mode) the entry is shown open, as in the preview.
 */
export function useGlowbookPlanKnown(): boolean | null {
  const { userId, realAuth } = useAuth();
  const live = isSupabaseConfigured && realAuth;
  const [known, setKnown] = useState<{ userId: string; glowbook: boolean } | null>(null);

  useEffect(() => {
    if (!live || !userId || known?.userId === userId) return;
    let cancelled = false;
    fetchStudioAccess()
      .then((info) => {
        if (!cancelled) setKnown({ userId, glowbook: info.glowbook });
      })
      .catch(() => {
        /* Unknown: the entry stays neutral. */
      });
    return () => {
      cancelled = true;
    };
  }, [live, userId, known]);

  if (!live) return true;
  return known && known.userId === userId ? known.glowbook : null;
}
