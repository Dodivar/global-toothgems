import type { i18n as I18n } from "i18next";
import i18n from "./i18n";
import { PRODUCTS } from "./data/products";
import type { CatalogSeed } from "./lib/catalog/CatalogProvider";
import { productSlugTranslator } from "./lib/catalog/productSlugs";
import { createServerLocalizedHistory } from "./lib/localizedHistory";
import type { Locale } from "./lib/localeRoutes";
import { isSupabaseConfigured } from "./lib/supabase/env";
import { AppRoot, BrowserRoot } from "./AppRoot";
import App from "./App";

/**
 * The public zone in the browser (`App.tsx`). `catalog`: what the server read
 * for a server-rendered page.
 */
export default function ClientApp({ catalog }: { catalog?: CatalogSeed }) {
  return (
    <BrowserRoot>
      <App catalog={catalog} />
    </BrowserRoot>
  );
}

/* One i18next instance per language for server renders: requests in both
   languages can be rendered at once, and none may change another's language. */
const serverI18n = new Map<Locale, I18n>();

/**
 * The same app rendered on the server for a public page (phase 3.2): at the
 * requested address, in the language of the address, from the catalogue the
 * server read. The browser then hydrates it with `ClientApp`, which must
 * render the same markup first.
 */
export function ServerApp({ address, locale, catalog }: { address: string; locale: Locale; catalog?: CatalogSeed }) {
  let instance = serverI18n.get(locale);
  if (!instance) {
    instance = i18n.cloneInstance({ lng: locale, initAsync: false });
    serverI18n.set(locale, instance);
  }
  // Prices and dates are formatted with the shared instance's language
  // (`lib/format.ts`). Set synchronously: the render below does not suspend,
  // so no other request can change it before this page is rendered.
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
  const translate = productSlugTranslator(isSupabaseConfigured ? (catalog?.products ?? []) : PRODUCTS);
  return (
    <AppRoot history={createServerLocalizedHistory(address, locale, translate)} i18n={instance}>
      <App catalog={catalog} />
    </AppRoot>
  );
}
