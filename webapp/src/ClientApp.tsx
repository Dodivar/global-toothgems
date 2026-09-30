import { StrictMode } from "react";
import { I18nextProvider } from "react-i18next";
import { unstable_HistoryRouter as HistoryRouter } from "react-router-dom";
import type { i18n as I18n } from "i18next";
import i18n from "./i18n";
import { PRODUCTS } from "./data/products";
import type { CatalogSeed } from "./lib/catalog/CatalogProvider";
import { productSlugTranslator } from "./lib/catalog/productSlugs";
import { createLocalizedHistory, createServerLocalizedHistory } from "./lib/localizedHistory";
import type { Locale } from "./lib/localeRoutes";
import { isSupabaseConfigured } from "./lib/supabase/env";
import App from "./App";

type History = Parameters<typeof HistoryRouter>[0]["history"];

/* One browser history for the page's lifetime (`lib/localizedHistory.ts`),
   created on first use: never on the server. */
let browserHistory: History | null = null;

function AppRoot({ history, i18n, catalog }: { history: History; i18n: I18n; catalog?: CatalogSeed }) {
  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <HistoryRouter history={history}>
          <App catalog={catalog} />
        </HistoryRouter>
      </I18nextProvider>
    </StrictMode>
  );
}

/**
 * The React Router app in the browser (formerly mounted by `main.tsx` under
 * Vite). `catalog`: what the server read for a server-rendered page.
 */
export default function ClientApp({ catalog }: { catalog?: CatalogSeed }) {
  browserHistory ??= createLocalizedHistory(i18n);
  return <AppRoot history={browserHistory} i18n={i18n} catalog={catalog} />;
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
  return <AppRoot history={createServerLocalizedHistory(address, locale, translate)} i18n={instance} catalog={catalog} />;
}
