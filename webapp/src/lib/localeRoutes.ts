import { STUDIO_EDITOR_ALIAS, STUDIO_SHARE_ALIAS, STUDIO_SHARE_PATH, studioSectionFromPath, studioSectionPath } from "./studioUrl";

/**
 * Language in the address of public pages (decided 2026-09-30,
 * docs/migration-nextjs.md phase 3): `/fr/…` and `/en/…`, English pages with
 * English path segments (`/fr/boutique` ↔ `/en/shop`). The member space, the
 * learner pages, the Studio workspace, sign-in and the back office are not
 * prefixed: their language is the visitor's preference.
 *
 * Screens keep writing their historical French paths ("internal" paths
 * below: `/boutique`, `/aide/faq`…); the navigation module (`lib/navigation`)
 * turns them into addresses and reads addresses back, the public pages'
 * segments (`app/(public)/fr`, `app/(public)/en`) follow this table, the proxy
 * redirects the old unprefixed addresses, and the server builds metadata from
 * the same table.
 * Pure: no React, no Next.js, no `window`.
 */

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** When neither a saved choice nor the browser names a supported language (decided). */
export const FALLBACK_LOCALE: Locale = "en";

/** The saved language choice: a cookie the server reads, mirrored in localStorage for the browser. */
export const LANGUAGE_KEY = "gt-lang";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "fr" || value === "en";
}

export type PublicRouteId =
  | "home"
  | "shop"
  | "product"
  | "shapes"
  | "colours"
  | "cart"
  | "checkoutReturn"
  | "loyalty"
  | "giftCard"
  | "studio"
  | "studioSubscribe"
  | "academy"
  | "course"
  | "help"
  | "faq"
  | "contact"
  | "about"
  | "legalNotice"
  | "terms"
  | "privacy"
  | "cookies"
  | "shipping"
  | "returns";

export interface PublicRoute {
  id: PublicRouteId;
  /** Path after the locale prefix; `:name` segments are parameters. `fr` is also the internal path. */
  fr: string;
  en: string;
  /** Indexed by search engines and listed in the sitemap (the cart is not). */
  indexed: boolean;
}

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  { id: "home", fr: "/", en: "/", indexed: true },
  { id: "shop", fr: "/boutique", en: "/shop", indexed: true },
  { id: "product", fr: "/boutique/:id", en: "/shop/:id", indexed: true },
  { id: "shapes", fr: "/formes", en: "/shapes", indexed: true },
  { id: "colours", fr: "/couleurs", en: "/colours", indexed: true },
  { id: "cart", fr: "/panier", en: "/cart", indexed: false },
  // Stripe's return address (supabase/functions/create-checkout-session builds it).
  { id: "checkoutReturn", fr: "/panier/confirmation", en: "/cart/confirmation", indexed: false },
  { id: "loyalty", fr: "/fidelite", en: "/loyalty", indexed: true },
  { id: "giftCard", fr: "/carte-cadeau", en: "/gift-card", indexed: true },
  { id: "studio", fr: "/studio-3d", en: "/3d-studio", indexed: true },
  { id: "studioSubscribe", fr: "/studio-3d/abonnement", en: "/3d-studio/subscribe", indexed: true },
  { id: "academy", fr: "/academy", en: "/academy", indexed: true },
  { id: "course", fr: "/academy/formation/:id", en: "/academy/course/:id", indexed: true },
  { id: "help", fr: "/aide", en: "/help", indexed: true },
  { id: "faq", fr: "/aide/faq", en: "/help/faq", indexed: true },
  { id: "contact", fr: "/contact", en: "/contact", indexed: true },
  { id: "about", fr: "/a-propos", en: "/about", indexed: true },
  { id: "legalNotice", fr: "/mentions-legales", en: "/legal-notice", indexed: true },
  { id: "terms", fr: "/conditions-generales", en: "/terms-of-sale", indexed: true },
  { id: "privacy", fr: "/confidentialite", en: "/privacy-policy", indexed: true },
  { id: "cookies", fr: "/cookies", en: "/cookie-policy", indexed: true },
  { id: "shipping", fr: "/livraison", en: "/shipping", indexed: true },
  { id: "returns", fr: "/retours-remboursements", en: "/returns", indexed: true },
];

const ROUTE_BY_ID = new Map(PUBLIC_ROUTES.map((route) => [route.id, route]));

export function publicRoute(id: PublicRouteId): PublicRoute {
  return ROUTE_BY_ID.get(id)!;
}

const segments = (path: string) => path.split("/").filter(Boolean);

/** Matches a path against a pattern; the parameters, or null. */
function match(pattern: string, path: string): Record<string, string> | null {
  const want = segments(pattern);
  const have = segments(path);
  if (want.length !== have.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(":")) params[want[i].slice(1)] = have[i];
    else if (want[i] !== have[i]) return null;
  }
  return params;
}

function fill(pattern: string, params: Record<string, string>): string {
  return "/" + segments(pattern).map((s) => (s.startsWith(":") ? params[s.slice(1)] : s)).join("/");
}

/**
 * Translates the parameters of a public route into a language: product pages
 * have one slug per language (`product_translations.slug`), so
 * `/fr/boutique/coeur-chrome` is `/en/shop/chrome-heart-tooth-gem` in English.
 * Internal paths carry the French values. Every other parameter is the same in
 * both languages. The catalogue provides the translator
 * (`lib/catalog/productSlugs.ts`); without one, parameters are left as they are.
 */
export type ParamTranslator = (id: PublicRouteId, params: Record<string, string>, locale: Locale) => Record<string, string>;

const keepParams: ParamTranslator = (_id, params) => params;

/** The public route a locale-less path belongs to in one language. */
function find(path: string, locale: Locale): { route: PublicRoute; params: Record<string, string> } | null {
  for (const route of PUBLIC_ROUTES) {
    const params = match(route[locale], path);
    if (params) return { route, params };
  }
  return null;
}

/** The address of a public route in a language: `/en/shop/aurora-heart`. */
export function localizedPath(id: PublicRouteId, locale: Locale, params: Record<string, string> = {}): string {
  const path = fill(publicRoute(id)[locale], params);
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export interface ParsedPath {
  /** The language in the address, or null when the path has no prefix. */
  locale: Locale | null;
  /** The public route, when the prefixed path is one. */
  route: PublicRoute | null;
  params: Record<string, string>;
  /**
   * The path the screens know: the French path of a public route,
   * the path itself when it has no prefix, and the unchanged path for an
   * unknown prefixed one (which the app renders as its 404).
   */
  internal: string;
}

/**
 * Reads an address: `/en/shop/x` → locale "en", internal `/boutique/<x in French>`.
 * `params` are the values as written in the address.
 */
export function parsePath(pathname: string, translate: ParamTranslator = keepParams): ParsedPath {
  const [first] = segments(pathname);
  if (!isLocale(first)) return { locale: null, route: null, params: {}, internal: pathname };
  const rest = pathname.slice(first.length + 1) || "/";
  const found = find(rest, first);
  if (!found) return { locale: first, route: null, params: {}, internal: pathname };
  const internal = fill(found.route.fr, translate(found.route.id, found.params, "fr"));
  return { locale: first, route: found.route, params: found.params, internal };
}

/**
 * Writes an internal path for the address bar in a language: a public route
 * gets its prefix and translated segments; any other path is left as it is.
 */
export function toAddress(internal: string, locale: Locale, translate: ParamTranslator = keepParams): string {
  const parsed = parsePath(internal);
  if (parsed.locale) {
    // Already an address (an unknown prefixed path): keep it, in this language.
    if (parsed.route) return localizedPath(parsed.route.id, locale, translate(parsed.route.id, parsed.params, locale));
    return `/${locale}${internal.slice(parsed.locale.length + 1)}`;
  }
  const found = find(internal, "fr");
  return found ? localizedPath(found.route.id, locale, translate(found.route.id, found.params, locale)) : internal;
}

/** The parameters of an internal path of a public route (`/boutique/x` → `{ id: "x" }`), else null. */
export function internalParams(internal: string): Record<string, string> | null {
  return find(internal, "fr")?.params ?? null;
}

/** The address of the same page in each language, for hreflang and the language switch. */
export function alternates(parsed: ParsedPath, translate: ParamTranslator = keepParams): Record<Locale, string> | null {
  const { route, params } = parsed;
  if (!route) return null;
  return {
    fr: localizedPath(route.id, "fr", translate(route.id, params, "fr")),
    en: localizedPath(route.id, "en", translate(route.id, params, "en")),
  };
}

/**
 * Old addresses, now permanently moved. Unprefixed public paths were the
 * French pages; the English aliases the app used to accept lead to the English
 * pages. The home page is negotiated instead (`negotiateLocale`).
 */
const LEGACY_ALIASES: Record<string, string> = {
  "/accueil-b": localizedPath("home", "fr"),
  "/boutique-b": localizedPath("shop", "fr"),
  // The sign-in page's former design-comparison address.
  "/connexion-b": "/connexion",
  "/gift-card": localizedPath("giftCard", "en"),
  "/studio-3d/subscribe": localizedPath("studioSubscribe", "en"),
  "/help": localizedPath("help", "en"),
  "/faq": localizedPath("faq", "en"),
  "/shipping": localizedPath("shipping", "en"),
  "/returns": localizedPath("returns", "en"),
  "/legal-notice": localizedPath("legalNotice", "en"),
  "/terms-of-sale": localizedPath("terms", "en"),
  "/privacy-policy": localizedPath("privacy", "en"),
  "/cookie-policy": localizedPath("cookies", "en"),
  "/about": localizedPath("about", "en"),
};

/**
 * The Studio workspace's English aliases (phase 5; browser redirects before):
 * `/studio-3d/editor/groups` → `/studio-3d/atelier/mes-groupes` (the section
 * comes along, an unknown one opens the editor), `/studio-3d/share/<token>` →
 * `/studio-3d/partage/<token>`. A shared design's fragment (`#…`) is kept by
 * the browser across the redirect.
 */
function studioAlias(pathname: string): string | null {
  if (pathname === STUDIO_EDITOR_ALIAS || pathname.startsWith(`${STUDIO_EDITOR_ALIAS}/`)) {
    return studioSectionPath(studioSectionFromPath(pathname));
  }
  if (pathname === STUDIO_SHARE_ALIAS || /^\/studio-3d\/share\/[^/]+$/.test(pathname)) {
    return `${STUDIO_SHARE_PATH}${pathname.slice(STUDIO_SHARE_ALIAS.length)}`;
  }
  return null;
}

/** Where an old unprefixed address now lives, or null. */
export function legacyAddress(pathname: string): string | null {
  if (pathname === "/") return null;
  const alias = LEGACY_ALIASES[pathname] ?? studioAlias(pathname);
  if (alias) return alias;
  if (isLocale(segments(pathname)[0])) return null;
  const found = find(pathname, "fr");
  return found ? localizedPath(found.route.id, "fr", found.params) : null;
}

/**
 * The language of a visitor without one in the address: their saved choice,
 * else the first supported language of the browser, else English.
 */
export function negotiateLocale(saved: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(saved)) return saved;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...options] = part.trim().split(";");
      const q = options.map((o) => o.trim()).find((o) => o.startsWith("q="));
      return { language: tag.split("-")[0].toLowerCase(), q: q ? Number(q.slice(2)) : 1, index };
    })
    .filter((entry) => entry.language && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked.map((entry) => entry.language).find(isLocale) ?? FALLBACK_LOCALE;
}
