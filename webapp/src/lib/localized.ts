import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { pick, type Localized } from "../data/types";

/**
 * Reads the active language out of a `Localized` value.
 *
 * Product content is stored per language rather than per column, so almost
 * every admin component needs this. Wrapping `pick` in a hook keeps the
 * `i18n.language` argument out of the JSX.
 */
export function useLocalized() {
  const { i18n } = useTranslation();
  return useCallback((value: Localized) => pick(value, i18n.language), [i18n.language]);
}

/** The language a `Localized` field is currently being edited in. */
export type ContentLang = "fr" | "en";

export const CONTENT_LANGS: ContentLang[] = ["fr", "en"];
