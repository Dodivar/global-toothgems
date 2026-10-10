import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { useProgress } from "./progress";
import { isSupabaseConfigured } from "./supabase/client";
import { canEnterLounge } from "./communityChat/loungeApi";

/**
 * Access to the Members' Lounge for the signed-in visitor, and the visitor as
 * a lounge member.
 *
 * The lounge is what a training unlocks. With Supabase the database answers
 * (`lounge_access()`: an active account holding an active course, or an
 * active team member) and enforces the same rule on every read and write —
 * this flag only chooses between the lounge and its locked screen. In mock
 * mode (no Supabase) the rule is read from the courses on the demo account.
 */

/** The visitor as the lounge shows them, built from the account (mock mode). */
export interface LoungeViewer {
  name: string;
  location?: string;
  bio: { fr: string; en: string };
  /** ISO date. */
  joined: string;
  tone: "blue";
}

interface CommunityContextValue {
  /** Whether the visitor can enter the lounge. */
  hasAccess: boolean;
  /** False while the answer is on its way (live mode). */
  accessKnown: boolean;
  viewer: LoungeViewer;
}

const CommunityContext = createContext<CommunityContextValue | null>(null);

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { displayName, profile, userId } = useAuth();
  const { enrolledCourses } = useProgress();
  const ownedCourses = enrolledCourses().length;
  const [liveAccess, setLiveAccess] = useState<{ owner: string; allowed: boolean } | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;
    let cancelled = false;
    canEnterLounge()
      .then((allowed) => !cancelled && setLiveAccess({ owner: userId, allowed }))
      .catch(() => !cancelled && setLiveAccess({ owner: userId, allowed: false }));
    return () => {
      cancelled = true;
    };
    /* A course bought or granted in this session opens the lounge without a reload. */
  }, [userId, ownedCourses]);

  const access = liveAccess && liveAccess.owner === userId ? liveAccess.allowed : null;
  const hasAccess = isSupabaseConfigured ? access === true : ownedCourses > 0;
  const accessKnown = isSupabaseConfigured ? access !== null || !userId : true;

  /** The account's own city, shown the way the lounge shows a location. */
  const location = profile?.city ? `${profile.city}, ${profile.country.toUpperCase()}` : undefined;

  const viewer = useMemo<LoungeViewer>(
    () => ({
      name: displayName || "—",
      location,
      bio: {
        fr: "Votre profil public dans la communauté. Il reprend votre nom et vos formations.",
        en: "Your public profile in the community. It follows your name and your courses.",
      },
      joined: new Date().toISOString().slice(0, 10),
      tone: "blue",
    }),
    [displayName, location],
  );

  const value = useMemo<CommunityContextValue>(() => ({ hasAccess, accessKnown, viewer }), [hasAccess, accessKnown, viewer]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error("useCommunity must be used within CommunityProvider");
  return ctx;
}
