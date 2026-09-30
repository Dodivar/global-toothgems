import { StrictMode, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { unstable_HistoryRouter as HistoryRouter } from "react-router-dom";
import type { i18n as I18n } from "i18next";
import i18n from "./i18n";
import { createLocalizedHistory } from "./lib/localizedHistory";

export type History = Parameters<typeof HistoryRouter>[0]["history"];

/* One browser history for the page's lifetime (`lib/localizedHistory.ts`),
   created on first use: never on the server. */
let browserHistory: History | null = null;

export function AppRoot({ history, i18n, children }: { history: History; i18n: I18n; children: ReactNode }) {
  return (
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <HistoryRouter history={history}>
          {children}
        </HistoryRouter>
      </I18nextProvider>
    </StrictMode>
  );
}

/**
 * A zone's React Router app in the browser (formerly mounted by `main.tsx`
 * under Vite): the zone apps of `src/zones/` render their routes inside it.
 */
export function BrowserRoot({ children }: { children: ReactNode }) {
  browserHistory ??= createLocalizedHistory(i18n);
  return (
    <AppRoot history={browserHistory} i18n={i18n}>
      {children}
    </AppRoot>
  );
}
