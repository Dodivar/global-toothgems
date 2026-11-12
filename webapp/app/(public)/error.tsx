"use client";

import { useCaptureRenderError } from "../../src/lib/useCaptureRenderError";
import { ServerError } from "../../src/screens/ServerError";
import { BrowserOnly } from "../../src/zones/BrowserOnly";

/**
 * A public page that failed while rendering: the server-error screen in its
 * place, in the storefront's chrome (the screen `/erreur` shows too).
 */
export default function Error({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useCaptureRenderError(error, "public");
  return (
    <BrowserOnly>
      <ServerError />
    </BrowserOnly>
  );
}
