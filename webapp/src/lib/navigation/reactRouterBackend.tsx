import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  Navigate as RouterNavigate,
  useLocation as useRouterLocation,
  useNavigate as useRouterNavigate,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";
import type { NavigationBackend, NavigateFunction, SetSearchParams } from "./types";

/*
 * The navigation API on React Router, for the screens still mounted by a zone
 * app (`src/zones/`, `App.tsx`) during phase 5 of docs/migration-nextjs.md.
 * Links keep their internal paths: the localized history translates them
 * (`lib/localizedHistory.ts`). Transitional: removed with React Router.
 */
export const reactRouterBackend: NavigationBackend = {
  Link: RouterLink,
  NavLink: RouterNavLink,
  Navigate: RouterNavigate,
  useNavigate: () => useRouterNavigate() as NavigateFunction,
  useLocation: () => {
    const { pathname, search, hash, state } = useRouterLocation();
    return { pathname, search, hash, state: state ?? null };
  },
  useParams: () => useRouterParams(),
  useSearchParams: () => {
    const [params, setParams] = useRouterSearchParams();
    return [params, setParams as SetSearchParams];
  },
};
