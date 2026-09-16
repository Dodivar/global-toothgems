import i18n from "../i18n";

/**
 * Number-formatting locale per UI language. Currency stays EUR across all of
 * them — the shop ships to FR/DE/BE/IE, which are all euro countries — so only
 * the separators and symbol placement change: "49 €" vs "€49".
 */
const PRICE_LOCALES: Record<string, string> = {
  fr: "fr-FR",
  en: "en-IE",
};

function priceLocale(): string {
  const lang = (i18n.language ?? "fr").slice(0, 2);
  return PRICE_LOCALES[lang] ?? PRICE_LOCALES.fr;
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
