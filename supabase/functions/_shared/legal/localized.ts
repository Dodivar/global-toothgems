// Generated from webapp/src/data/types.ts by webapp/scripts/sync-documents.mjs — edit the source, then run `npm run sync:documents`.
export interface Localized {
  fr: string;
  en: string;
}

export function pick(value: Localized, lang: string): string {
  return lang.startsWith("en") ? value.en : value.fr;
}
