/*
 * The navigation API of every screen (docs/migration-nextjs.md, phase 5):
 * `Link`, `NavLink`, `Navigate`, `useNavigate`, `useLocation`, `useParams`,
 * `useSearchParams`, on the Next.js router (`next/link`, `next/navigation`),
 * with the names and shapes React Router gave them, so the screens moved
 * from it unchanged. Links are written with the app's internal paths (French
 * paths for public pages); the address in the current language, with the
 * product's slug in that language, is worked out here (`href.ts`).
 */
export { Link, Navigate, NavLink } from "./components";
export { useLocation, useNavigate, useParams, useSearchParams } from "./hooks";
export { useLanguageSwitch } from "./language";
export { NavigationTracker, useCanGoBack } from "./history";
export type { AppLocation, LinkProps, NavigateFunction, NavLinkProps, To } from "./types";
