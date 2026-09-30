import type { i18n as I18n } from "i18next";
import i18n from "./index";
import type { Locale } from "../lib/localeRoutes";

/* One i18next instance per language, sharing the translations of the main
   one: a server render uses its page's language whatever other request is
   rendered at the same time, and never changes another's language. */
const byLocale = new Map<Locale, I18n>();

export function i18nFor(locale: Locale): I18n {
  let instance = byLocale.get(locale);
  if (!instance) {
    instance = i18n.cloneInstance({ lng: locale, initAsync: false });
    byLocale.set(locale, instance);
  }
  return instance;
}
