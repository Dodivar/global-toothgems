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
