import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { resources } from "./resources";
import { FALLBACK_LOCALE, LANGUAGE_KEY, LOCALES, parsePath } from "../lib/localeRoutes";
import { syncLanguageCookie } from "./preference";

/*
 * Which language the UI speaks:
 * - on a public page, the one in the address (`/fr/…`, `/en/…`, see
 *   `lib/localeRoutes.ts`), with that language's instance (`instances.ts`,
 *   chosen by `AppProviders`); this main instance follows it;
 * - elsewhere (member space, sign-in, back office, Studio workspace), the saved
 *   choice (`gt-lang`, localStorage then cookie), else the browser's language,
 *   else English (decided 2026-09-30).
 * Detection never saves anything: only the language switches do
 * (`saveLanguagePreference`), so arriving on an English link does not
 * overwrite a saved French choice.
 */
const addressLocale = typeof window !== "undefined" ? parsePath(window.location.pathname).locale : null;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: addressLocale ?? undefined,
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: [...LOCALES],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "cookie", "navigator"],
      lookupLocalStorage: LANGUAGE_KEY,
      lookupCookie: LANGUAGE_KEY,
      caches: [],
    },
  });

syncLanguageCookie();

export default i18n;
