"use client";

import { PublicChrome, ServerErrorScreen } from "../src/zones/public";

/**
 * A page outside the public zone (member space, learner pages, back office,
 * Studio) that failed while rendering: the server-error screen, in the
 * storefront's chrome.
 */
export default function Error() {
  return (
    <PublicChrome>
      <ServerErrorScreen />
    </PublicChrome>
  );
}
