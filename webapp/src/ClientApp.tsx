import { useSlugTranslator } from "./lib/catalog/CatalogProvider";
import { createServerLocalizedHistory } from "./lib/localizedHistory";
import type { Locale } from "./lib/localeRoutes";
import { i18nFor } from "./i18n/instances";
import { AppRoot, BrowserRoot } from "./AppRoot";
import App from "./App";

/** The public zone in the browser (`App.tsx`). */
export default function ClientApp() {
  return (
    <BrowserRoot>
      <App />
    </BrowserRoot>
  );
}

/**
 * The same app rendered on the server for a public page (phase 3.2): at the
 * requested address, in the language of the address, from the catalogue the
 * server read (the stores of the root layout, whose product slugs its links
 * carry). The browser then hydrates it with `ClientApp`, which must render
 * the same markup first.
 */
export function ServerApp({ address, locale }: { address: string; locale: Locale }) {
  const translate = useSlugTranslator();
  return (
    <AppRoot history={createServerLocalizedHistory(address, locale, translate)} i18n={i18nFor(locale)}>
      <App />
    </AppRoot>
  );
}
