import { toAddress, type Locale, type ParamTranslator } from "../localeRoutes";

/** The parts of a link target: `/boutique?type=x#top` → pathname, `?type=x`, `#top`. */
export function splitTo(to: string): { pathname: string; search: string; hash: string } {
  const hashAt = to.indexOf("#");
  const hash = hashAt >= 0 ? to.slice(hashAt) : "";
  const beforeHash = hashAt >= 0 ? to.slice(0, hashAt) : to;
  const searchAt = beforeHash.indexOf("?");
  const search = searchAt >= 0 ? beforeHash.slice(searchAt) : "";
  const pathname = searchAt >= 0 ? beforeHash.slice(0, searchAt) : beforeHash;
  return { pathname, search: search === "?" ? "" : search, hash: hash === "#" ? "" : hash };
}

/**
 * The address a link written with an internal path leads to
 * (docs/migration-nextjs.md, phase 5): screens keep writing the app's French
 * paths (`/boutique/<French slug>`); a public page gets its language prefix,
 * English segments and slug (`/en/shop/<English slug>`), every other path is
 * left as it is. A target with only a query or a fragment stays on the
 * current address (`current`, already an address).
 */
export function resolveAddress(to: string, current: string, locale: Locale, translate?: ParamTranslator): string {
  const { pathname, search, hash } = splitTo(to);
  const path = pathname === "" ? current : toAddress(pathname, locale, translate);
  return `${path}${search}${hash}`;
}

/**
 * Whether a navigation link is the current page: the same internal path, or
 * (unless `end`) a page under it. Compares paths only, as React Router did.
 */
export function isActivePath(current: string, target: string, end = false): boolean {
  const trim = (path: string) => (path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path);
  const here = trim(current);
  const there = trim(splitTo(target).pathname || current);
  if (here === there) return true;
  if (end) return false;
  return there === "/" ? false : here.startsWith(`${there}/`);
}
