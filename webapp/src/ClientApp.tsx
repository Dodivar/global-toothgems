import { StrictMode } from "react";
import { unstable_HistoryRouter as HistoryRouter } from "react-router-dom";
import i18n from "./i18n";
import { createLocalizedHistory } from "./lib/localizedHistory";
import App from "./App";

/* One history for the page's lifetime; see `lib/localizedHistory.ts`. */
const history = createLocalizedHistory(i18n);

/** The client entry point formerly mounted by `main.tsx` under Vite. */
export default function ClientApp() {
  return (
    <StrictMode>
      <HistoryRouter history={history}>
        <App />
      </HistoryRouter>
    </StrictMode>
  );
}
