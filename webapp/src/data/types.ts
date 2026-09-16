export interface Localized {
  fr: string;
  en: string;
}

export function pick(value: Localized, lang: string): string {
  return lang.startsWith("en") ? value.en : value.fr;
}
