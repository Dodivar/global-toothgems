import type { i18n as I18n } from "i18next";
import { parsePath as parseTo, UNSAFE_createBrowserHistory as createBrowserHistory, type unstable_HistoryRouter } from "react-router-dom";
import { isLocale, parsePath, toAddress, type Locale, type ParamTranslator } from "./localeRoutes";
import { translateProductSlugs as translate } from "./catalog/productSlugRegistry";

type History = Parameters<typeof unstable_HistoryRouter>[0]["history"];
type To = Parameters<History["push"]>[0];
type Location = History["location"];

/**
 * The browser history the React Router app runs on, with localized addresses
 * (docs/migration-nextjs.md, phase 3).
 *
 * The app keeps its historical French paths (`/boutique`, `/aide/faq`…) in
 * routes, links and `navigate()`; this history translates at the edge:
 * - what the app reads (`location`) is the internal path: `/en/shop/x` →
 *   `/boutique/x`;
 * - what it writes (links' `href`, `push`, `replace`) becomes the address in
 *   the current language: `/boutique/x` → `/en/shop/x` or `/fr/boutique/x`.
 *   Paths that are not public pages (member space, back office…) pass through.
 *   Product slugs are translated too (`/en/shop/<English slug>`), from the
 *   catalogue the page has loaded (`catalog/productSlugRegistry.ts`);
 * - the language follows the address: going back from `/en/shop` to
 *   `/fr/boutique` switches the UI to French, and switching the UI language
 *   on a public page rewrites the address to the other language's.
 *
 * Transitional: it disappears with React Router in phase 5.
 */
export function createLocalizedHistory(i18n: I18n): History {
  const browser = createBrowserHistory({ v5Compat: true });
  const current = (): Locale => (i18n.resolvedLanguage === "en" || i18n.language?.startsWith("en") ? "en" : "fr");

  const internal = (location: Location): Location => ({ ...location, pathname: parsePath(location.pathname, translate).internal });

  const address = (to: To): To => {
    const path = typeof to === "string" ? parseTo(to) : to;
    return path.pathname === undefined ? path : { ...path, pathname: toAddress(path.pathname, current(), translate) };
  };

  /** The address decides the language of a public page. */
  const followAddress = (pathname: string) => {
    const { locale } = parsePath(pathname);
    if (locale && locale !== current()) void i18n.changeLanguage(locale);
  };

  i18n.on("languageChanged", (language) => {
    if (!isLocale(language)) return;
    const location = browser.location;
    const parsed = parsePath(location.pathname);
    if (parsed.locale && parsed.locale !== language) {
      browser.replace({ ...location, pathname: toAddress(location.pathname, language, translate) }, location.state);
    }
  });

  return {
    get action() {
      return browser.action;
    },
    get location() {
      return internal(browser.location);
    },
    createHref: (to) => browser.createHref(address(to)),
    createURL: (to) => browser.createURL(address(to)),
    // Route matching and active links compare with internal paths: encode, never translate.
    encodeLocation: (to) => browser.encodeLocation(to),
    push: (to, state) => browser.push(address(to), state),
    replace: (to, state) => browser.replace(address(to), state),
    go: (delta) => browser.go(delta),
    listen: (listener) =>
      browser.listen((update) => {
        followAddress(update.location.pathname);
        listener({ ...update, location: internal(update.location) });
      }),
  };
}

/**
 * The same history for a page rendered on the server: fixed at the requested
 * address, writing links exactly as the browser history will once the page
 * hydrates (so the server HTML and the first browser render agree): product
 * slugs from the page's own catalogue (`translate`), not the browser's
 * registry. It cannot navigate. Transitional, like `createLocalizedHistory`.
 */
export function createServerLocalizedHistory(address: string, locale: Locale, translate: ParamTranslator): History {
  const { pathname, search = "", hash = "" } = parseTo(address);
  const location: Location = {
    pathname: parsePath(pathname ?? "/", translate).internal,
    search,
    hash,
    state: null,
    key: "default",
  };
  const href = (to: To) => {
    const path = typeof to === "string" ? parseTo(to) : to;
    const pathname = path.pathname === undefined ? location.pathname : toAddress(path.pathname, locale, translate);
    return `${pathname}${path.search ?? ""}${path.hash ?? ""}`;
  };
  const cannotNavigate = () => {
    throw new Error("A page rendered on the server cannot navigate.");
  };
  return {
    action: "POP" as History["action"],
    location,
    createHref: href,
    createURL: (to) => new URL(href(to), "http://localhost"),
    encodeLocation: (to) => {
      const path = typeof to === "string" ? parseTo(to) : to;
      return { pathname: path.pathname ?? "", search: path.search ?? "", hash: path.hash ?? "" };
    },
    push: cannotNavigate,
    replace: cannotNavigate,
    go: cannotNavigate,
    listen: () => () => undefined,
  };
}
