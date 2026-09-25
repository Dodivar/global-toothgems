import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { STUDIO_SUBSCRIBE_PATH } from "./studioUrl";

/**
 * Who may open the 3D Studio editor.
 *
 * PREVIEW ACCESS — a deliberate, temporary product decision: while the Studio
 * is in preview, every visitor can open the editor for free, with no account
 * and no payment. The subscription page stays a visual prototype.
 *
 * This is the single switch for it. When the subscription goes live, the mode
 * becomes "subscription" and access comes from the account's entitlement,
 * which the server grants only when a verified Stripe webhook reports an
 * active subscription — never from the Checkout return page or from anything
 * the browser says. A check here is a navigation convenience, not a security
 * boundary: whatever the paid Studio stores or serves must be authorised on
 * the server (and by row-level security) as well.
 */
export type StudioAccessMode = "preview" | "subscription";

export const STUDIO_ACCESS_MODE: StudioAccessMode = "preview";

export type StudioAccess = { granted: true; via: "preview" } | { granted: false; via: "subscriptionRequired" };

function resolveAccess(mode: StudioAccessMode): StudioAccess {
  switch (mode) {
    case "preview":
      return { granted: true, via: "preview" };
    case "subscription":
      // Not built yet: no entitlement source exists, so nobody is let in.
      return { granted: false, via: "subscriptionRequired" };
  }
}

export function useStudioAccess(): StudioAccess {
  return resolveAccess(STUDIO_ACCESS_MODE);
}

/** Gate for the editor route: without access, the visitor is sent to the offer. */
export function RequireStudioAccess({ children }: { children: ReactNode }) {
  const access = useStudioAccess();
  if (!access.granted) return <Navigate to={STUDIO_SUBSCRIBE_PATH} replace />;
  return <>{children}</>;
}
