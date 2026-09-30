"use client";

import { ServerErrorScreen } from "../../src/zones/public";

/**
 * A public page that failed while rendering: the server-error screen in its
 * place, in the storefront's chrome (the screen `/erreur` shows too).
 */
export default function Error() {
  return <ServerErrorScreen />;
}
