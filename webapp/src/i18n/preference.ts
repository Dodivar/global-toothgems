import type { i18n as I18n } from "i18next";
import { isLocale, LANGUAGE_KEY, type Locale } from "../lib/localeRoutes";

/*
 * The visitor's saved language choice, written only by the language switches.
 * Kept in localStorage (where the app always kept it) and in a cookie, which
 * the server reads to send `/` to the right language. A functional preference
 * the visitor sets themselves; no tracking.
 */

const ONE_YEAR = 60 * 60 * 24 * 365;

function writeCookie(locale: Locale) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LANGUAGE_KEY}=${locale}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`;
}

export function saveLanguagePreference(locale: Locale) {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, locale);
  } catch {
    // Storage blocked: the cookie still carries the choice.
  }
  writeCookie(locale);
}

/** The FR/EN switch of the header, footer, member space and back office. */
export function switchLanguage(i18n: I18n) {
  const next: Locale = i18n.language?.startsWith("en") ? "fr" : "en";
  saveLanguagePreference(next);
  void i18n.changeLanguage(next);
}

/** A choice saved before the cookie existed is copied to it once, so the server knows it too. */
export function syncLanguageCookie() {
  if (typeof window === "undefined") return;
  try {
    const saved = window.localStorage.getItem(LANGUAGE_KEY);
    const hasCookie = document.cookie.split("; ").some((c) => c.startsWith(`${LANGUAGE_KEY}=`));
    if (isLocale(saved) && !hasCookie) writeCookie(saved);
  } catch {
    // Storage blocked: nothing saved to copy.
  }
}
