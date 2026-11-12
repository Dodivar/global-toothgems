"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

/**
 * Reports an error that an error page (`app/error.tsx`, `app/(public)/error.tsx`)
 * caught: React hands it to the page instead of letting it reach the window,
 * so PostHog's automatic exception capture never sees it. Sent only with the
 * visitor's analytics consent (PostHog is opted out otherwise).
 */
export function useCaptureRenderError(error: Error & { digest?: string }, zone: "public" | "app") {
  useEffect(() => {
    try {
      posthog.captureException(error, { error_boundary: zone, ...(error.digest ? { digest: error.digest } : {}) });
    } catch {
      /* analytics must never break the error page */
    }
  }, [error, zone]);
}
