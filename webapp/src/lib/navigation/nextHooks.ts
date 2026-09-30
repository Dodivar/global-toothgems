import { useParams as useNextParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from "next/navigation";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useSlugTranslator } from "../catalog/CatalogProvider";
import { internalParams, parsePath, type Locale } from "../localeRoutes";
import { resolveAddress } from "./href";
import { isNativeAddress } from "./native";
import { handOff, stateFor } from "./state";
import type { AppLocation, NavigateFunction, SetSearchParams } from "./types";

/*
 * The navigation API on the Next.js router (`next/link`, `next/navigation`),
 * for the screens rendered by their own App Router segment
 * (docs/migration-nextjs.md, phase 5). Screens write internal paths; links
 * are resolved to addresses here (`href.ts`), from the language of the
 * address, else the UI language, and the product slugs of the catalogue the
 * page holds, so the server and the first browser render write the same
 * `href`.
 *
 * Scrolling is left to `ScrollToTop` (top of the page on every new path, as
 * before): Next.js's own scrolling is turned off. Prefetching is off: the
 * pages are rendered per request, and a list of product cards would ask the
 * server for every one of them.
 */

function useLocale(pathname: string): Locale {
  const { i18n } = useTranslation();
  return parsePath(pathname).locale ?? (i18n.language?.startsWith("en") ? "en" : "fr");
}

/** Internal path → address, for the current page. */
export function useResolve(): (to: string) => string {
  const pathname = usePathname() ?? "/";
  const locale = useLocale(pathname);
  const translate = useSlugTranslator();
  return useCallback((to: string) => resolveAddress(to, pathname, locale, translate), [pathname, locale, translate]);
}

export function useInternalPath(): string {
  const pathname = usePathname() ?? "/";
  const translate = useSlugTranslator();
  return parsePath(pathname, translate).internal;
}

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export function useNavigate(): NavigateFunction {
  const router = useRouter();
  const resolve = useResolve();
  return useCallback(
    (to: string | number, options?: { replace?: boolean; state?: unknown }) => {
      if (typeof to === "number") {
        if (to === -1) router.back();
        else window.history.go(to);
        return;
      }
      const address = resolve(to);
      handOff(address, options?.state);
      if (!isNativeAddress(address)) {
        // A zone still mounted by React Router: the page is loaded.
        if (options?.replace) window.location.replace(address);
        else window.location.assign(address);
      } else if (options?.replace) router.replace(address, { scroll: false });
      else router.push(address, { scroll: false });
    },
    [router, resolve],
  ) as NavigateFunction;
}

export function useLocation(): AppLocation {
  const pathname = usePathname() ?? "/";
  const internal = useInternalPath();
  const params = useNextSearchParams();
  const query = params?.toString() ?? "";
  const search = query ? `?${query}` : "";
  // The fragment never reaches the server: empty until hydrated.
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
  // Read in the browser only; the screens that read it are not rendered on
  // the server (sign-in, registration, recovery).
  const state = typeof window === "undefined" ? null : stateFor(`${pathname}${search}`);
  return useMemo(() => ({ pathname: internal, search, hash, state }), [internal, search, hash, state]);
}

export function useParams(): Record<string, string | undefined> {
  const segmentParams = useNextParams();
  const internal = useInternalPath();
  return useMemo(() => {
    const params: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(segmentParams ?? {})) {
      params[key] = Array.isArray(value) ? value.join("/") : value;
    }
    // A public page's parameters as the app knows them (French slugs).
    return { ...params, ...(internalParams(internal) ?? {}) };
  }, [segmentParams, internal]);
}

export function useSearchParams(): [URLSearchParams, SetSearchParams] {
  const current = useNextSearchParams();
  const params = useMemo(() => new URLSearchParams(current?.toString() ?? ""), [current]);
  const setParams = useCallback<SetSearchParams>(
    (next, options) => {
      const value = typeof next === "function" ? next(new URLSearchParams(window.location.search)) : next;
      const query = new URLSearchParams(value as ConstructorParameters<typeof URLSearchParams>[0]).toString();
      const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
      // The same page with another query: the history API, which the Next.js
      // router follows (`useSearchParams`), without asking the server again.
      handOff(url, undefined);
      if (options?.replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [],
  );
  return [params, setParams];
}

