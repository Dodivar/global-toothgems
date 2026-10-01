import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { toMajorUnits } from "./catalog/money";

/**
 * Number-formatting locale per UI language. Currency stays EUR across all of
 * them — the shop ships to FR/DE/BE/IE, which are all euro countries — so only
 * the separators and symbol placement change: "49 €" vs "€49".
 */
const PRICE_LOCALES: Record<string, string> = {
  fr: "fr-FR",
  en: "en-IE",
};

/** The number and date locale of a UI language: `en` → `en-IE`. */
export function formatLocale(language: string | undefined): string {
  return PRICE_LOCALES[(language ?? "fr").slice(0, 2)] ?? PRICE_LOCALES.fr;
}

/* Outside React only (the shared i18next instance's language). Components use
   `useFormat()`, which follows the language of the tree they render in. */
function priceLocale(): string {
  return formatLocale(i18n.language);
}

export function formatPrice(value: number, locale: string = priceLocale(), currency: string = "EUR") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * An amount kept in integer minor units (cents) with its currency, as the
 * orders are: converted to major units only here, for display.
 */
export function formatMoney(minor: number, currency: string, locale: string = priceLocale()) {
  return formatPrice(toMajorUnits(minor), locale, currency);
}

/**
 * Dates in the UI language, from the ISO strings the mock data stores.
 * Same locale map as prices, so a language switch moves both at once.
 */
export function formatDate(iso: string, locale: string = priceLocale()) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

/** Short form for compact rows: "9 sept. 2026" / "9 Sep 2026". */
export function formatDateShort(iso: string, locale: string = priceLocale()) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

/** "Member since" only needs the month: "mars 2026" / "March 2026". */
export function formatMonthYear(iso: string, locale: string = priceLocale()) {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(new Date(iso));
}

/** Whole numbers with the language's separators: "1 248" / "1,248". */
export function formatCount(value: number, locale: string = priceLocale()) {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * The helpers above in the language of the rendering tree
 * (docs/migration-nextjs.md, phase 5): on the server, the page's language,
 * whatever other request is being rendered at the same time; in the browser,
 * the UI language. Every component formatting prices, dates or counts uses it.
 */
export function useFormat() {
  const { i18n: tree } = useTranslation();
  const locale = formatLocale(tree.language);
  return useMemo(
    () => ({
      locale,
      // Same signatures as the plain helpers; the locale defaults to the tree's.
      formatPrice: (value: number, at: string = locale, currency?: string) => formatPrice(value, at, currency),
      formatMoney: (minor: number, currency: string, at: string = locale) => formatMoney(minor, currency, at),
      formatDate: (iso: string, at: string = locale) => formatDate(iso, at),
      formatDateShort: (iso: string, at: string = locale) => formatDateShort(iso, at),
      formatMonthYear: (iso: string, at: string = locale) => formatMonthYear(iso, at),
      formatCount: (value: number, at: string = locale) => formatCount(value, at),
    }),
    [locale],
  );
}

/**
 * Relative age of a community post, as a translation key and its count.
 *
 * The community fixtures store ages in minutes rather than as dates, so a
 * prototype opened again months later still reads "2 h ago" instead of showing
 * a room whose last message is a season old. The formatting stays here, with
 * the other display helpers; the wording lives in the translations.
 */
export function timeAgoParts(minutesAgo: number): { key: string; count: number } {
  if (minutesAgo < 1) return { key: "community.timeNow", count: 0 };
  if (minutesAgo < 60) return { key: "community.timeMinutes", count: Math.round(minutesAgo) };
  if (minutesAgo < 60 * 24) return { key: "community.timeHours", count: Math.floor(minutesAgo / 60) };
  if (minutesAgo < 60 * 48) return { key: "community.timeYesterday", count: 1 };
  if (minutesAgo < 60 * 24 * 7) return { key: "community.timeDays", count: Math.floor(minutesAgo / (60 * 24)) };
  return { key: "community.timeWeeks", count: Math.floor(minutesAgo / (60 * 24 * 7)) };
}
