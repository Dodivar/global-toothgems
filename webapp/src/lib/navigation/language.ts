import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { saveLanguagePreference } from "../../i18n/preference";
import { useSlugTranslator } from "../catalog/CatalogProvider";
import { parsePath, toAddress, type Locale } from "../localeRoutes";

/**
 * The FR/EN switch of the header, footer, member space and back office
 * (docs/migration-nextjs.md, phases 3.1 and 5). It saves the choice, and:
 * - on a public page, whose language is its address, it moves to the same
 *   page in the other language (the product's slug in that language, query
 *   and fragment kept), replacing the history entry as before;
 * - elsewhere, it changes the UI language in place.
 */
export function useLanguageSwitch(): () => void {
  const { i18n: tree } = useTranslation();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const translate = useSlugTranslator();
  return useCallback(() => {
    const next: Locale = tree.language?.startsWith("en") ? "fr" : "en";
    saveLanguagePreference(next);
    // The UI language of the pages without one in their address.
    void i18n.changeLanguage(next);
    if (parsePath(pathname).locale) {
      const address = toAddress(parsePath(pathname, translate).internal, next, translate);
      router.replace(`${address}${window.location.search}${window.location.hash}`, { scroll: false });
    }
  }, [tree, pathname, router, translate]);
}
