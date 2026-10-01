"use client";

import { PublicChrome } from "../src/zones/public";
import { ServerError } from "../src/screens/ServerError";
import { BrowserOnly } from "../src/zones/BrowserOnly";

/**
 * A page outside the public zone (member space, learner pages, back office,
 * Studio) that failed while rendering: the server-error screen, in the
 * storefront's chrome.
 */
export default function Error() {
  return (
    <PublicChrome>
      <BrowserOnly>
        <ServerError />
      </BrowserOnly>
    </PublicChrome>
  );
}
