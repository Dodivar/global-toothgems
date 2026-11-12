"use client";

import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { useEffect } from "react";
import { useAdminAuth } from "./adminAuth";
import { useCookieConsent } from "./cookieConsent";
import { appEnvironment, replayAllowed } from "./posthogConfig";

/**
 * Drives PostHog from the visitor's choices and the page shown, in one place
 * and in this order (one effect, so opting in always comes before recording):
 *
 * 1. consent — capture and persistence only while the cookie choice accepts
 *    the analytics category (`lib/cookieConsent.tsx`); refusing stops
 *    everything, replay included, and erases PostHog's identifier;
 * 2. properties on every event — `app_environment` (production, preview,
 *    development) and `is_staff`, so the team's own visits can be filtered
 *    out (PostHog › Settings › "Filter out internal and test users", on the
 *    person property `is_staff`);
 * 3. session replay — on only where `replayAllowed()` says (storefront,
 *    Studio, learner pages), off everywhere else (member space, back office,
 *    sign-in, guest withdrawal).
 *
 * Analytics never breaks the site: every call is guarded.
 */
export function PostHogSession() {
  const { record } = useCookieConsent();
  const { admin } = useAdminAuth();
  const pathname = usePathname() ?? "/";
  const consented = record?.analytics === true;
  const staff = admin !== null;
  const recordHere = consented && replayAllowed(pathname);

  useEffect(() => {
    try {
      if (!posthog.__loaded) return;
      if (!consented) {
        if (posthog.sessionRecordingStarted()) posthog.stopSessionRecording();
        if (!posthog.has_opted_out_capturing()) posthog.opt_out_capturing();
        return;
      }
      if (!posthog.has_opted_in_capturing()) posthog.opt_in_capturing();
      posthog.register({ app_environment: appEnvironment(), is_staff: staff });
      // A person property too (signed-in visitors only: anonymous ones have no profile).
      if (staff) posthog.setPersonProperties({ is_staff: true });
      if (recordHere && !posthog.sessionRecordingStarted()) posthog.startSessionRecording();
      if (!recordHere && posthog.sessionRecordingStarted()) posthog.stopSessionRecording();
    } catch {
      /* analytics must never break the site */
    }
  }, [consented, staff, recordHere]);

  return null;
}
