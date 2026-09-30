import { Link, Navigate, NavLink } from "./nextComponents";
import { useLocation, useNavigate, useParams, useSearchParams } from "./nextHooks";
import type { NavigationBackend } from "./types";

/** The navigation API on the Next.js router (docs/migration-nextjs.md, phase 5). */
export const nextBackend: NavigationBackend = { Link, NavLink, Navigate, useNavigate, useLocation, useParams, useSearchParams };
