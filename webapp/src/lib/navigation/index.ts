/*
 * The navigation API of every screen (docs/migration-nextjs.md, phase 5):
 * `Link`, `NavLink`, `Navigate`, `useNavigate`, `useLocation`, `useParams`,
 * `useSearchParams`, with React Router's names and shapes so screens moved
 * from it unchanged. Links are written with the app's internal paths (French
 * paths for public pages); the address in the current language is worked out
 * here.
 *
 * Two implementations while phase 5 runs: the Next.js router (`nextBackend`,
 * the default: screens rendered by their own App Router segment) and React
 * Router (`reactRouterBackend`, provided by `AppRoot` for the screens a zone
 * app still mounts). A given place in the tree always gets the same one, so
 * the hooks below are called in a stable order.
 */
export { Link, Navigate, NavigationBackendProvider, NavLink } from "./components";
export { useLocation, useNavigate, useParams, useSearchParams } from "./hooks";
export type { AppLocation, LinkProps, NavigateFunction, NavLinkProps, To } from "./types";
