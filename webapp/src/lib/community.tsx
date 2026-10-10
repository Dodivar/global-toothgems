import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { useProgress } from "./progress";

/**
 * Access to the Members' Lounge for the signed-in visitor, and the visitor as
 * a lounge member.
 *
 * Mockup state, exactly like `cart.tsx`, `auth.tsx` and `progress.tsx`: it lives
 * in memory and nothing is verified. Access is derived, not stored: the lounge
 * is what a training purchase unlocks, so "has a course on the account" is the
 * rule, and `lib/progress.tsx` already owns that fact. The demo override exists
 * because the seeded account owns two courses, so the locked experience would
 * otherwise be unreachable in a review.
 *
 * None of this is access control. Real authorization belongs to the server, on
 * a verified payment event, exactly as for course content.
 */

/** How lounge access is decided. `auto` reads the account; the others force it. */
export type AccessMode = "auto" | "member" | "locked";

export const ACCESS_MODES: AccessMode[] = ["auto", "member", "locked"];

/** The visitor as the lounge shows them, built from the account. */
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
  /** True when access comes from the account rather than from the demo switch. */
  accessMode: AccessMode;
  setAccessMode: (mode: AccessMode) => void;
  /** Courses on the account — what the locked card offers to change. */
  ownedCourses: number;
  viewer: LoungeViewer;
}

const CommunityContext = createContext<CommunityContextValue | null>(null);

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { displayName, profile } = useAuth();
  const { enrolledCourses } = useProgress();

  const [accessMode, setAccessMode] = useState<AccessMode>("auto");

  const ownedCourses = enrolledCourses().length;
  const hasAccess = accessMode === "auto" ? ownedCourses > 0 : accessMode === "member";

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

  const value = useMemo<CommunityContextValue>(
    () => ({ hasAccess, accessMode, setAccessMode, ownedCourses, viewer }),
    [hasAccess, accessMode, ownedCourses, viewer],
  );

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error("useCommunity must be used within CommunityProvider");
  return ctx;
}
